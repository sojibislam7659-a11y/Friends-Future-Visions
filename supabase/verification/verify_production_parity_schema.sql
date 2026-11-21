-- Read-only acceptance checks for the staged Production parity migrations.
-- Run against an isolated Production restore after applying the migrations.
do $verify$
declare
  v_count integer;
  v_def text;
begin
  if to_regclass('public.site_settings') is null
     or to_regclass('public.admin_change_audit') is null
     or to_regclass('public.notification_push_deliveries') is null
     or to_regclass('public.financial_postings') is null
     or to_regclass('private.password_rotation_guards') is null then
    raise exception 'Parity schema tables are missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='must_change_password' and data_type='boolean' and is_nullable='NO'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='password_change_required_at' and data_type='timestamp with time zone'
  ) then
    raise exception 'Profile password rotation columns are missing or have incorrect types';
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='site_settings'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then raise exception 'site_settings must have RLS and FORCE RLS'; end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='admin_change_audit' and c.relrowsecurity
  ) then raise exception 'admin_change_audit RLS is disabled'; end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='notification_push_deliveries' and c.relrowsecurity
  ) then raise exception 'notification_push_deliveries RLS is disabled'; end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='financial_postings' and c.relrowsecurity
  ) then raise exception 'financial_postings RLS is disabled'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.financial_transaction_audit'::regclass
      and conname='financial_transaction_audit_action_check'
      and pg_get_constraintdef(oid) like '%INSERT%'
  ) then raise exception 'Financial audit INSERT action is not permitted by its CHECK constraint'; end if;

  if exists (select 1 from public.financial_transactions where posting_id is null) then
    raise exception 'An unlinked financial transaction exists';
  end if;
  if exists (
    select 1 from public.financial_transactions t
    left join public.financial_postings p on p.id=t.posting_id
    where p.id is null
  ) then raise exception 'A financial transaction references a missing posting'; end if;

  if has_table_privilege('anon','public.financial_transactions','INSERT')
     or has_table_privilege('anon','public.financial_transactions','UPDATE')
     or has_table_privilege('anon','public.financial_transactions','DELETE')
     or has_table_privilege('authenticated','public.financial_transactions','INSERT')
     or has_table_privilege('authenticated','public.financial_transactions','UPDATE')
     or has_table_privilege('authenticated','public.financial_transactions','DELETE') then
    raise exception 'Direct financial_transactions write privileges remain exposed';
  end if;

  if has_table_privilege('anon','public.financial_postings','SELECT')
     or has_table_privilege('authenticated','public.financial_postings','INSERT')
     or has_table_privilege('authenticated','public.financial_postings','UPDATE')
     or has_table_privilege('authenticated','public.financial_postings','DELETE') then
    raise exception 'financial_postings direct grants are too broad';
  end if;

  if has_table_privilege('anon','public.financial_transaction_audit','SELECT') then
    raise exception 'Anonymous financial audit reads remain granted';
  end if;

  if has_schema_privilege('anon','private','USAGE') then
    raise exception 'Anonymous role still has private schema USAGE';
  end if;

  select pg_get_functiondef('private.is_super_admin()'::regprocedure) into v_def;
  if v_def not like '%aal2%' then raise exception 'Super Admin MFA/AAL2 gate is missing'; end if;
  select pg_get_functiondef('private.has_portal_access()'::regprocedure) into v_def;
  if v_def not like '%aal2%' then raise exception 'Portal Super Admin MFA/AAL2 gate is missing'; end if;

  if exists (select 1 from public.profiles where role not in ('member','super_admin')) then
    raise exception 'Unexpected profile role exists';
  end if;
  if exists (
    select 1 from public.profiles p
    where p.role='super_admin'
      and not exists (select 1 from auth.mfa_factors f where f.user_id=p.id and f.status='verified')
  ) then raise exception 'A Super Admin has no verified MFA factor'; end if;

  select pg_get_functiondef('private.get_financial_summary_unchecked()'::regprocedure) into v_def;
  if v_def not like '%reversal_of_id%' or v_def not like '%2031-12-31%' then
    raise exception 'Financial summary is not the reversal-aware Development implementation';
  end if;
  if has_function_privilege('authenticated','private.get_financial_summary_unchecked()','EXECUTE')
     or has_function_privilege('anon','private.get_financial_summary_unchecked()','EXECUTE') then
    raise exception 'Unchecked financial summary helper is directly executable by API roles';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='financial_postings'
      and policyname='Financial postings: Super Admin read' and cmd='SELECT'
  ) then raise exception 'Financial posting Super Admin read policy is missing'; end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='notification_push_deliveries'
      and policyname='notification_push_deliveries_service_role_all' and cmd='ALL'
  ) then raise exception 'Push delivery service-role policy is missing'; end if;

  select count(*) into v_count from public.site_settings
  where setting_key in ('ticker_enabled','ticker_message');
  if v_count<>2 then raise exception 'Expected ticker settings were not seeded'; end if;
end;
$verify$;
