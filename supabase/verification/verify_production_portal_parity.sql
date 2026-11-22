-- Read-only verification for the Production portal/audit/push/password parity migration.
-- Run only against an isolated Production restore rehearsal after applying
-- the portal, public-policy, Storage-policy, and immutable-ledger migrations.

do $verify$
declare
  v_count integer;
  v_def text;
  v_rls boolean;
  v_force boolean;
begin
  if to_regclass('public.site_settings') is null
     or to_regclass('public.admin_change_audit') is null
     or to_regclass('public.notification_push_deliveries') is null
     or to_regclass('private.password_rotation_guards') is null then
    raise exception 'Missing one or more portal parity tables';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='must_change_password' and data_type='boolean'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='password_change_required_at'
  ) then
    raise exception 'Temporary password rotation columns are missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='members'
      and column_name='monthly_contribution'
      and column_default like '%2000%'
  ) then
    raise exception 'Monthly contribution default does not match Development';
  end if;

  select c.relrowsecurity,c.relforcerowsecurity into v_rls,v_force
  from pg_class c where c.oid='public.site_settings'::regclass;
  if not v_rls or not v_force then
    raise exception 'site_settings must have RLS enabled and forced';
  end if;

  select c.relrowsecurity into v_rls
  from pg_class c where c.oid='public.admin_change_audit'::regclass;
  if not v_rls then
    raise exception 'admin_change_audit RLS is not enabled';
  end if;

  select count(*) into v_count
  from information_schema.triggers
  where trigger_schema='public' and trigger_name='audit_admin_change'
    and event_object_table in (
      'committee_documents','committee_proofs','member_contribution_rates',
      'member_private_documents','members','notices','payment_methods',
      'payment_submissions','profile_change_requests','profiles','site_settings'
    );
  if v_count <> 33 then
    raise exception 'Expected 33 admin audit trigger events across 11 tables; found %',v_count;
  end if;

  if has_column_privilege('authenticated','public.profiles','full_name','UPDATE') then
    raise exception 'Authenticated still has a legacy full_name UPDATE grant';
  end if;
  if not has_column_privilege('authenticated','public.profiles','must_change_password','UPDATE') then
    raise exception 'Authenticated cannot complete the controlled password rotation flag update';
  end if;

  if has_table_privilege('authenticated','private.password_rotation_guards','SELECT')
     or has_table_privilege('authenticated','private.password_rotation_guards','INSERT')
     or has_table_privilege('anon','private.password_rotation_guards','SELECT')
     or has_table_privilege('service_role','private.password_rotation_guards','SELECT') then
    raise exception 'Password rotation guard table is exposed to an API role';
  end if;
  if has_schema_privilege('anon','private','USAGE') then
    raise exception 'Anonymous role still has private schema USAGE';
  end if;

  if not has_table_privilege('authenticated','public.site_settings','SELECT')
     or has_table_privilege('anon','public.site_settings','SELECT') then
    raise exception 'site_settings grants are unexpected';
  end if;
  if has_table_privilege('authenticated','public.admin_change_audit','INSERT')
     or has_table_privilege('authenticated','public.admin_change_audit','UPDATE')
     or has_table_privilege('authenticated','public.admin_change_audit','DELETE') then
    raise exception 'Authenticated can mutate admin audit rows';
  end if;

  if has_table_privilege('authenticated','public.notification_push_deliveries','SELECT')
     or has_table_privilege('authenticated','public.notification_push_deliveries','INSERT')
     or has_table_privilege('anon','public.notification_push_deliveries','SELECT') then
    raise exception 'Push delivery diagnostics are exposed to browser roles';
  end if;
  if not has_function_privilege('service_role','public.claim_notification_push_delivery(uuid,uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.claim_notification_push_delivery(uuid,uuid)','EXECUTE')
     or has_function_privilege('anon','public.claim_notification_push_delivery(uuid,uuid)','EXECUTE') then
    raise exception 'Push delivery claim RPC grants are unexpected';
  end if;

  select pg_get_functiondef('private.is_super_admin()'::regprocedure) into v_def;
  if position('aal2' in lower(v_def))=0 then
    raise exception 'Super Admin helper does not require AAL2';
  end if;
  select pg_get_functiondef('private.has_portal_access()'::regprocedure) into v_def;
  if position('aal2' in lower(v_def))=0
     or position('must_change_password' in lower(v_def))=0 then
    raise exception 'Portal access helper is missing MFA or password-rotation gates';
  end if;

  if exists (
    select 1 from public.profiles
    where role not in ('member','super_admin') or role is null
  ) then
    raise exception 'Legacy or unexpected profile role remains';
  end if;
  if exists (
    select 1 from public.profiles p
    where p.role='super_admin'
      and not exists (
        select 1 from auth.mfa_factors f
        where f.user_id=p.id and f.status='verified'
      )
  ) then
    raise exception 'A Super Admin has no verified MFA factor';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.push_subscriptions'::regclass
      and conname='push_subscriptions_endpoint_provider_check'
      and position('mozilla[.]com' in pg_get_constraintdef(oid))>0
  ) then
    raise exception 'Push provider constraint does not match the Development Mozilla endpoint';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='notifications'
      and policyname='notifications_read_own_or_super_admin'
      and cmd='SELECT'
      and qual like '%private.has_portal_access%'
      and qual like '%private.is_super_admin%'
  ) or not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='notifications'
      and policyname='notifications_update_own'
      and cmd='UPDATE'
      and qual like '%private.has_portal_access%'
      and with_check like '%private.has_portal_access%'
  ) then
    raise exception 'Notification policies do not match Development portal-access rules';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public' and (
      (tablename='notifications' and policyname='notifications_read_own')
      or (tablename='committee_documents' and policyname='Committee documents: Super Admin manage')
      or (tablename='payment_methods' and policyname='Payment methods: Super Admin manage')
      or (tablename='payment_submissions' and policyname='Payments: Super Admin full access')
      or (tablename='profiles' and policyname='Profiles: Super Admin update')
    )
  ) then
    raise exception 'Legacy Production-only public RLS policy remains';
  end if;

  if (
    select count(*) from pg_policies
    where schemaname='public'
      and (
        (tablename='committee_documents' and policyname in (
          'Committee documents: Super Admin insert',
          'Committee documents: Super Admin update',
          'Committee documents: Super Admin delete'
        ))
        or (tablename='payment_methods' and policyname in (
          'Payment methods: Super Admin insert',
          'Payment methods: Super Admin update',
          'Payment methods: Super Admin delete'
        ))
        or (tablename='payment_submissions' and policyname in (
          'Payments: Super Admin update',
          'Payments: Super Admin delete'
        ))
      )
  ) <> 8 then
    raise exception 'Committee/payment Super Admin policy set does not match Development';
  end if;

  if (
    select count(*) from pg_policies where schemaname='public'
  ) <> 59 then
    raise exception 'Expected 59 public policies matching Development after all migrations';
  end if;

  if not has_table_privilege('anon','public.committee_rules','SELECT')
     or has_table_privilege('anon','public.committee_rules','INSERT')
     or has_table_privilege('anon','public.committee_rules','UPDATE')
     or has_table_privilege('anon','public.committee_rules','DELETE') then
    raise exception 'Anonymous committee_rules access must be SELECT only';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
    where n.nspname='public'
      and c.relkind in ('r','p','v','m','f')
      and acl.grantee='anon'::regrole::oid
      and not (c.relname='committee_rules' and acl.privilege_type='SELECT')
  ) then
    raise exception 'Legacy anonymous privileges remain on public tables';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl,acldefault('S',c.relowner))) acl
    where n.nspname='public' and c.relkind='S'
      and acl.grantee='anon'::regrole::oid
  ) then
    raise exception 'Anonymous sequence privileges remain in public schema';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
    where n.nspname='public'
      and c.relkind in ('r','p','v','m','f')
      and acl.grantee='authenticated'::regrole::oid
      and acl.privilege_type in ('REFERENCES','TRIGGER','TRUNCATE')
  ) then
    raise exception 'Authenticated retains REFERENCES, TRIGGER, or TRUNCATE on a public table';
  end if;

  if has_table_privilege('authenticated','public.member_contribution_rates','INSERT')
     or has_table_privilege('authenticated','public.member_contribution_rates','UPDATE')
     or has_table_privilege('authenticated','public.member_contribution_rates','DELETE') then
    raise exception 'Contribution-rate writes must go through the audited RPC';
  end if;

  if not has_table_privilege('authenticated','public.committee_rules','SELECT')
     or not has_table_privilege('authenticated','public.committee_rules','UPDATE')
     or has_table_privilege('authenticated','public.committee_rules','INSERT')
     or has_table_privilege('authenticated','public.committee_rules','DELETE') then
    raise exception 'Authenticated committee_rules grants must be SELECT and UPDATE only';
  end if;

  if not has_column_privilege('authenticated','public.notifications','read_at','UPDATE') then
    raise exception 'Members cannot mark their own notifications as read';
  end if;

  if exists (
    select 1
    from pg_default_acl d
    cross join lateral aclexplode(d.defaclacl) acl
    where d.defaclrole='postgres'::regrole
      and d.defaclnamespace='public'::regnamespace
      and acl.grantee='anon'::regrole::oid
  ) then
    raise exception 'Future public objects created by postgres still inherit anon privileges';
  end if;

  if exists (
    select 1
    from pg_default_acl d
    cross join lateral aclexplode(d.defaclacl) acl
    where d.defaclrole='postgres'::regrole
      and d.defaclnamespace='public'::regnamespace
      and d.defaclobjtype='r'
      and acl.grantee='authenticated'::regrole::oid
      and acl.privilege_type in ('REFERENCES','TRIGGER','TRUNCATE')
  ) then
    raise exception 'Future public tables still grant unnecessary authenticated privileges';
  end if;
end;
$verify$;

select 'portal, audit, password rotation, push delivery and MFA parity verified' as verification_result;
