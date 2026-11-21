-- Production-parity schema for site settings, admin audit, push delivery,
-- and temporary-password rotation.
-- STAGED ONLY: apply only after the verified full backup/restore gate.
-- This migration intentionally requires verified MFA for every Production
-- Super Admin before enabling the Development portal-access rule (AAL2).
begin;

do $preflight$
begin
  if to_regclass('public.site_settings') is not null
     or to_regclass('public.admin_change_audit') is not null
     or to_regclass('public.notification_push_deliveries') is not null
     or to_regclass('private.password_rotation_guards') is not null then
    raise exception 'Preflight failed: one or more parity objects already exist; reconcile manually';
  end if;
  if not exists (
    select 1 from public.profiles p
    join auth.mfa_factors f on f.user_id=p.id and f.status='verified'
    where p.role='super_admin'
  ) or exists (
    select 1 from public.profiles p
    where p.role='super_admin'
      and not exists (select 1 from auth.mfa_factors f where f.user_id=p.id and f.status='verified')
  ) then
    raise exception 'Preflight failed: every Production Super Admin must enroll and verify an MFA factor before AAL2 access is enabled';
  end if;
  if not exists (select 1 from pg_proc where oid=to_regprocedure('private.is_super_admin()')) then
    raise exception 'Preflight failed: private.is_super_admin() is missing';
  end if;
  if not exists (select 1 from pg_proc where oid=to_regprocedure('private.has_portal_access()')) then
    raise exception 'Preflight failed: private.has_portal_access() is missing';
  end if;
end
$preflight$;

-- Keep the existing eight Production profiles; new flags default to the
-- non-blocking state and do not force password changes for existing users.
alter table public.profiles
  add column must_change_password boolean not null default false,
  add column password_change_required_at timestamptz;

-- Private guard table stores only a fingerprint of the Auth password hash,
-- never the password or the password hash itself.
create table private.password_rotation_guards (
  user_id uuid primary key references auth.users(id) on delete cascade,
  password_hash_fingerprint text not null,
  captured_at timestamptz not null default now()
);

revoke usage on schema private from anon;
grant usage on schema private to authenticated;

create or replace function private.capture_password_rotation_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_fingerprint text;
begin
  if new.must_change_password=true then
    select md5(u.encrypted_password) into v_fingerprint
    from auth.users u
    where u.id=new.id and nullif(u.encrypted_password,'') is not null;
    if v_fingerprint is null then
      raise exception 'A password-backed Auth user is required for temporary-password rotation';
    end if;
    insert into private.password_rotation_guards(user_id,password_hash_fingerprint,captured_at)
    values(new.id,v_fingerprint,now())
    on conflict(user_id) do update
      set password_hash_fingerprint=excluded.password_hash_fingerprint,
          captured_at=excluded.captured_at;
  end if;
  return new;
end;
$function$;

create or replace function private.guard_temporary_password_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_initial_fingerprint text; v_current_fingerprint text;
begin
  if old.must_change_password=true and new.must_change_password=false then
    select g.password_hash_fingerprint,md5(u.encrypted_password)
    into v_initial_fingerprint,v_current_fingerprint
    from private.password_rotation_guards g
    join auth.users u on u.id=g.user_id
    where g.user_id=old.id
    for update of g;
    if v_initial_fingerprint is null or v_current_fingerprint is null
       or v_initial_fingerprint=v_current_fingerprint then
      raise exception 'A different password must be saved before completing this step' using errcode='42501';
    end if;
    delete from private.password_rotation_guards where user_id=old.id;
    new.password_change_required_at := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists capture_password_rotation_guard on public.profiles;
create trigger capture_password_rotation_guard
after insert or update of must_change_password, password_change_required_at
on public.profiles for each row
execute function private.capture_password_rotation_guard();

drop trigger if exists guard_temporary_password_change on public.profiles;
create trigger guard_temporary_password_change
before update of must_change_password on public.profiles
for each row execute function private.guard_temporary_password_change();

drop policy if exists "Profiles: Super Admin update" on public.profiles;
create policy profiles_update_super_admin_or_password_flag
on public.profiles for update to authenticated
using (
  (select private.is_super_admin())
  or (
    id=(select auth.uid())
    and role='member'
    and must_change_password=true
    and exists (select 1 from public.members m where m.auth_user_id=profiles.id and m.status='active')
  )
)
with check (
  (select private.is_super_admin())
  or (
    id=(select auth.uid())
    and role='member'
    and must_change_password=false
    and exists (select 1 from public.members m where m.auth_user_id=profiles.id and m.status='active')
  )
);

-- Match Development's narrow direct table privileges: Super Admin profile
-- editing remains through its audited server-side workflow; members may only
-- update the temporary-password flag while completing rotation.
revoke insert,update,delete on public.profiles from authenticated;
grant update (must_change_password) on public.profiles to authenticated;

-- Require AAL2 for every privileged Super Admin action, not only portal reads.
create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid())
      and p.role='super_admin'
      and (select auth.jwt()->>'aal')='aal2'
  );
$function$;
revoke all on function private.is_super_admin() from public,anon;
grant execute on function private.is_super_admin() to authenticated,service_role;

-- Portal access: Super Admin requires AAL2; ordinary members must be active
-- and must have completed any temporary-password rotation.
create or replace function private.has_portal_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    exists (
      select 1 from public.profiles p
      where p.id=(select auth.uid())
        and p.role='super_admin'
        and (select auth.jwt()->>'aal')='aal2'
    )
    or exists (
      select 1 from public.profiles p
      join public.members m on m.auth_user_id=p.id
      where p.id=(select auth.uid())
        and p.role='member'
        and m.status='active'
        and coalesce(p.must_change_password,false)=false
    );
$function$;
revoke all on function private.has_portal_access() from public, anon;
grant execute on function private.has_portal_access() to authenticated, service_role;

-- Site-wide ticker/settings. Existing Production settings are not overwritten.
create table public.site_settings (
  setting_key text primary key
    check (setting_key in ('ticker_message','ticker_enabled')),
  setting_value text not null check (char_length(setting_value)<=2000),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index site_settings_updated_by_idx on public.site_settings(updated_by);
alter table public.site_settings enable row level security;
alter table public.site_settings force row level security;
revoke all on public.site_settings from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.site_settings to authenticated;
grant all on public.site_settings to service_role;

create policy "Site settings: approved portal users read"
on public.site_settings for select to authenticated
using ((select private.has_portal_access()));
create policy "Site settings: Super Admin insert"
on public.site_settings for insert to authenticated
with check ((select private.is_super_admin()));
create policy "Site settings: Super Admin update"
on public.site_settings for update to authenticated
using ((select private.is_super_admin()))
with check ((select private.is_super_admin()));
create policy "Site settings: Super Admin delete"
on public.site_settings for delete to authenticated
using ((select private.is_super_admin()));

insert into public.site_settings(setting_key,setting_value)
values
  ('ticker_enabled','true'),
  ('ticker_message','আপনাকে ফ্রেন্ডস ফিউচার ভিশন ফরইভার এ স্বাগতম। আপনাকে আমাদের কোম্পানির পার্টনারশিপ ও মেম্বার হওয়ার জন্য অনেক অনেক শুভেচ্ছা জানাই। নিজের আইডি পাসওয়ার্ড নিজের কাছে রাখুন। অন্যদের সাথে শেয়ার করা থেকে বিরত থাকুন। নিজের বকেয়া প্রতি মাসের নির্ধারিত সময় (মাসের ১৫ তারিখের মধ্যে) এর মধ্যে দায়িত্বপ্রাপ্তদের হাতে বুঝিয়ে দিন। ইন শাহ আল্লাহ আমাদের স্বপ্ন বাস্তব হবে সকলে একসাথে থাকলে। ধন্যবাদ।')
on conflict(setting_key) do nothing;

-- Append-only audit records. Only Super Admin can read; trigger owner writes.
create table public.admin_change_audit (
  id bigint generated by default as identity primary key,
  table_name text not null,
  record_id text,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  old_record jsonb,
  new_record jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index admin_change_audit_changed_at_idx on public.admin_change_audit(changed_at desc);
create index admin_change_audit_entity_idx on public.admin_change_audit(table_name,record_id,changed_at desc);
alter table public.admin_change_audit enable row level security;
revoke all on public.admin_change_audit from public,anon,authenticated,service_role;
grant select on public.admin_change_audit to authenticated;
grant all on public.admin_change_audit to service_role;
create policy admin_change_audit_super_admin_read
on public.admin_change_audit for select to authenticated
using ((select private.is_super_admin()));

create or replace function private.audit_admin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  old_data jsonb;
  new_data jsonb;
  entity_id text;
begin
  if tg_op in ('UPDATE','DELETE') then old_data:=to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then new_data:=to_jsonb(new); end if;
  entity_id:=coalesce(new_data->>'id',old_data->>'id');
  insert into public.admin_change_audit(table_name,record_id,operation,old_record,new_record,changed_by)
  values(tg_table_name,entity_id,tg_op,old_data,new_data,(select auth.uid()));
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists audit_admin_change on public.profiles;
create trigger audit_admin_change
after insert or update or delete on public.profiles
for each row execute function private.audit_admin_change();
create trigger audit_admin_change
after insert or update or delete on public.site_settings
for each row execute function private.audit_admin_change();

-- Align push subscription validation, ownership and per-account device limits.
do $push_preflight$
begin
  if exists (
    select 1 from public.push_subscriptions
    where endpoint !~* '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-z0-9-]+[.]notify[.]windows[.]com)/'
       or p256dh !~ '^[A-Za-z0-9_-]{80,100}
create table public.notification_push_deliveries (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'sending' check (status in ('sending','sent','failed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  last_status_code integer,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key(notification_id,subscription_id)
);
create index notification_push_deliveries_subscription_idx
on public.notification_push_deliveries(subscription_id);
alter table public.notification_push_deliveries enable row level security;
grant all on public.notification_push_deliveries to service_role;
revoke all on public.notification_push_deliveries from public,anon,authenticated,service_role;
grant all on public.notification_push_deliveries to service_role;
create policy notification_push_deliveries_service_role_all
on public.notification_push_deliveries for all to service_role
using (true) with check (true);

CREATE OR REPLACE FUNCTION public.claim_notification_push_delivery(p_notification_id uuid, p_subscription_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_attempts integer;
BEGIN
  IF (SELECT auth.jwt()->>'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.notification_push_deliveries(notification_id,subscription_id,status,attempts,updated_at)
  VALUES(p_notification_id,p_subscription_id,'sending',1,now())
  ON CONFLICT(notification_id,subscription_id) DO UPDATE
    SET status='sending',
        attempts=public.notification_push_deliveries.attempts+1,
        updated_at=now()
    WHERE public.notification_push_deliveries.status<>'sent'
      AND public.notification_push_deliveries.attempts<5
      AND (public.notification_push_deliveries.status<>'sending'
           OR public.notification_push_deliveries.updated_at<now()-interval '10 minutes')
  RETURNING attempts INTO v_attempts;
  RETURN coalesce(v_attempts,0);
END;
$function$;
revoke all on function public.claim_notification_push_delivery(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_notification_push_delivery(uuid,uuid) to service_role;

commit;

       or auth_key !~ '^[A-Za-z0-9_-]{16,32}
create table public.notification_push_deliveries (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'sending' check (status in ('sending','sent','failed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  last_status_code integer,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key(notification_id,subscription_id)
);
create index notification_push_deliveries_subscription_idx
on public.notification_push_deliveries(subscription_id);
alter table public.notification_push_deliveries enable row level security;
grant all on public.notification_push_deliveries to service_role;
create policy notification_push_deliveries_service_role_all
on public.notification_push_deliveries for all to service_role
using (true) with check (true);

commit;

       or (user_agent is not null and length(user_agent)>512)
  ) then
    raise exception 'Preflight failed: Production contains invalid push subscription rows';
  end if;
end
$push_preflight$;

alter table public.push_subscriptions
  alter column id set default gen_random_uuid(),
  alter column created_at set default now(),
  alter column updated_at set default now(),
  add constraint push_subscriptions_auth_key_format_check
    check (auth_key ~ '^[A-Za-z0-9_-]{16,32}
create table public.notification_push_deliveries (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'sending' check (status in ('sending','sent','failed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  last_status_code integer,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key(notification_id,subscription_id)
);
create index notification_push_deliveries_subscription_idx
on public.notification_push_deliveries(subscription_id);
alter table public.notification_push_deliveries enable row level security;
grant all on public.notification_push_deliveries to service_role;
create policy notification_push_deliveries_service_role_all
on public.notification_push_deliveries for all to service_role
using (true) with check (true);

commit;
),
  add constraint push_subscriptions_endpoint_provider_check
    check (endpoint ~* '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-z0-9-]+[.]notify[.]windows[.]com)/'),
  add constraint push_subscriptions_p256dh_format_check
    check (p256dh ~ '^[A-Za-z0-9_-]{80,100}
create table public.notification_push_deliveries (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'sending' check (status in ('sending','sent','failed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  last_status_code integer,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key(notification_id,subscription_id)
);
create index notification_push_deliveries_subscription_idx
on public.notification_push_deliveries(subscription_id);
alter table public.notification_push_deliveries enable row level security;
grant all on public.notification_push_deliveries to service_role;
create policy notification_push_deliveries_service_role_all
on public.notification_push_deliveries for all to service_role
using (true) with check (true);

commit;
),
  add constraint push_subscriptions_user_agent_length_check
    check (user_agent is null or length(user_agent)<=512);

revoke all on public.push_subscriptions from anon;
grant select,insert,update,delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
for select to authenticated
using (user_id=(select auth.uid()) and (select private.has_portal_access()));
create policy push_subscriptions_insert_own on public.push_subscriptions
for insert to authenticated
with check (user_id=(select auth.uid()) and (select private.has_portal_access()));
create policy push_subscriptions_update_own on public.push_subscriptions
for update to authenticated
using (user_id=(select auth.uid()) and (select private.has_portal_access()))
with check (user_id=(select auth.uid()) and (select private.has_portal_access()));
create policy push_subscriptions_delete_own on public.push_subscriptions
for delete to authenticated
using (user_id=(select auth.uid()) and (select private.has_portal_access()));

CREATE OR REPLACE FUNCTION private.enforce_push_subscription_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE existing_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
  SELECT count(*) INTO existing_count
  FROM public.push_subscriptions
  WHERE user_id=NEW.user_id AND id<>NEW.id;
  IF existing_count>=5 THEN
    RAISE EXCEPTION 'A maximum of five push devices may be registered per account';
  END IF;
  RETURN NEW;
END;
$function$;
revoke all on function private.enforce_push_subscription_limit() from public,anon,authenticated,service_role;
drop trigger if exists enforce_push_subscription_limit on public.push_subscriptions;
create trigger enforce_push_subscription_limit
before insert or update of user_id on public.push_subscriptions
for each row execute function private.enforce_push_subscription_limit();

-- Push delivery diagnostics are writable only by trusted Edge Functions.
create table public.notification_push_deliveries (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'sending' check (status in ('sending','sent','failed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  last_status_code integer,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key(notification_id,subscription_id)
);
create index notification_push_deliveries_subscription_idx
on public.notification_push_deliveries(subscription_id);
alter table public.notification_push_deliveries enable row level security;
grant all on public.notification_push_deliveries to service_role;
create policy notification_push_deliveries_service_role_all
on public.notification_push_deliveries for all to service_role
using (true) with check (true);

commit;
