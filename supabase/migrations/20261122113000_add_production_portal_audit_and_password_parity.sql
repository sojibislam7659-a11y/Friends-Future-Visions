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

-- Match Development's future-member default without rewriting existing rows.
alter table public.members alter column monthly_contribution set default 2000;

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

-- Bring shared app RPCs/triggers to Development's safe implementation.
CREATE OR REPLACE FUNCTION public.assign_member_no_when_active()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.status = 'active' and nullif(btrim(new.member_no), '') is null then
    new.member_no := 'M-' || lpad(nextval('public.member_no_seq')::text, 3, '0');
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.is_committee_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT private.is_super_admin();
$function$;
CREATE OR REPLACE FUNCTION public.save_committee_proof_metadata(p_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_change record;
  v_saved integer := 0;
  v_rows integer;
BEGIN
  IF v_actor IS NULL OR NOT (SELECT private.is_super_admin()) THEN
    RAISE EXCEPTION 'Super Admin permission required' USING ERRCODE = '42501';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' OR jsonb_array_length(p_changes) > 200 THEN
    RAISE EXCEPTION 'Proof changes must be a JSON array of at most 200 items';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_changes) e
    WHERE jsonb_typeof(e) <> 'object'
       OR NOT (e ? 'id' AND e ? 'proof_month' AND e ? 'title' AND e ? 'note' AND e ? 'published')
       OR nullif(trim(e->>'title'),'') IS NULL
       OR length(e->>'title') > 180
       OR length(coalesce(e->>'note','')) > 500
  ) THEN
    RAISE EXCEPTION 'Each proof requires a valid ID, month, title, note and published flag';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT (e->>'id')::uuid) FROM jsonb_array_elements(p_changes) e) THEN
    RAISE EXCEPTION 'Duplicate proof IDs are not allowed';
  END IF;

  FOR v_change IN
    SELECT (e->>'id')::uuid AS id,
           (e->>'proof_month')::date AS proof_month,
           trim(e->>'title') AS title,
           nullif(trim(e->>'note'),'') AS note,
           (e->>'published')::boolean AS published
    FROM jsonb_array_elements(p_changes) e
    ORDER BY 1
  LOOP
    IF v_change.proof_month <> date_trunc('month',v_change.proof_month)::date
       OR v_change.proof_month < DATE '2027-01-01'
       OR v_change.proof_month >= DATE '2032-01-01' THEN
      RAISE EXCEPTION 'Proof month must be the first day of a month from Jan 2027 through Dec 2031';
    END IF;
    UPDATE public.committee_proofs
    SET proof_month=v_change.proof_month,title=v_change.title,note=v_change.note,published=v_change.published
    WHERE id=v_change.id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN RAISE EXCEPTION 'Proof not found: %',v_change.id; END IF;
    v_saved := v_saved + 1;
  END LOOP;
  RETURN jsonb_build_object('saved',v_saved);
END;
$function$;
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.is_super_admin();
$function$;

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

-- Match Development notice recipient filtering and contribution-rate guardrails.
CREATE OR REPLACE FUNCTION private.notify_notice_recipients()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.published = true AND (TG_OP='INSERT' OR OLD.published=false) THEN
    INSERT INTO public.notifications(user_id,notice_id,title,body,notification_type)
    SELECT p.id,NEW.id,NEW.title,'You have a notification from Friends Future Vision.','general'
    FROM public.profiles p
    WHERE p.role='super_admin'
       OR (p.role='member' AND EXISTS (
         SELECT 1 FROM public.members m
         WHERE m.auth_user_id=p.id AND m.status='active'
       ))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
revoke all on function private.notify_notice_recipients() from public,anon,authenticated;
grant execute on function private.notify_notice_recipients() to service_role;

CREATE OR REPLACE FUNCTION private.set_member_contribution_rate(p_member_id uuid, p_amount numeric, p_effective_from date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  current_rate public.member_contribution_rates%rowtype;
  next_start date;
BEGIN
  IF NOT (SELECT private.is_super_admin()) THEN RAISE EXCEPTION 'Super Admin permission required'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount,2) OR p_amount > 999999999999.99 THEN
    RAISE EXCEPTION 'Monthly amount must be positive and use no more than two decimal places';
  END IF;
  IF p_effective_from IS NULL OR extract(day FROM p_effective_from) <> 1 THEN
    RAISE EXCEPTION 'Effective date must be the first day of a month';
  END IF;
  IF p_effective_from < DATE '2027-01-01' OR p_effective_from > DATE '2031-12-01' THEN
    RAISE EXCEPTION 'Effective date must be within January 2027–December 2031';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.members WHERE id=p_member_id AND status='active') THEN
    RAISE EXCEPTION 'Active member not found';
  END IF;
  SELECT * INTO current_rate
  FROM public.member_contribution_rates
  WHERE member_id=p_member_id AND effective_from<=p_effective_from
    AND (effective_to IS NULL OR effective_to>=p_effective_from)
  ORDER BY effective_from DESC LIMIT 1 FOR UPDATE;
  SELECT min(effective_from) INTO next_start
  FROM public.member_contribution_rates
  WHERE member_id=p_member_id AND effective_from>p_effective_from;
  IF FOUND AND current_rate.effective_from=p_effective_from THEN
    UPDATE public.member_contribution_rates SET monthly_amount=p_amount WHERE id=current_rate.id;
  ELSE
    UPDATE public.member_contribution_rates
    SET effective_to=p_effective_from-1
    WHERE member_id=p_member_id AND effective_from<p_effective_from
      AND (effective_to IS NULL OR effective_to>=p_effective_from);
    INSERT INTO public.member_contribution_rates(member_id,monthly_amount,effective_from,effective_to,created_by)
    VALUES(p_member_id,p_amount,p_effective_from,CASE WHEN next_start IS NULL THEN NULL ELSE next_start-1 END,(SELECT auth.uid()));
  END IF;
  UPDATE public.members
  SET monthly_contribution=p_amount,contribution_start_date=coalesce(contribution_start_date,p_effective_from)
  WHERE id=p_member_id;
END;
$function$;
revoke all on function private.set_member_contribution_rate(uuid,numeric,date) from public,anon;
grant execute on function private.set_member_contribution_rate(uuid,numeric,date) to authenticated,service_role;

revoke all on function private.get_member_shared_financial_data() from public,anon,authenticated,service_role;

-- Legacy service-side matrix read is not an authenticated client RPC.
CREATE OR REPLACE FUNCTION public.get_member_shared_financial_data()
 RETURNS TABLE(member_id uuid, member_no text, full_name text, full_name_bn text, contribution_month date, amount numeric, paid_day integer, last_paid_at timestamp with time zone, total_paid numeric, total_due numeric, due_configured boolean, has_manual boolean, matrix_count integer)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT * FROM private.get_member_shared_financial_data();
$function$;
revoke all on function public.get_member_shared_financial_data() from public,anon,authenticated;
grant execute on function public.get_member_shared_financial_data() to service_role;

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
