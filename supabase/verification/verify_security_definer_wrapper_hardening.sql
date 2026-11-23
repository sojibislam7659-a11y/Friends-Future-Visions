-- Run only against an isolated Production restore rehearsal after applying
-- 20261122103000_harden_production_security_definer_wrappers.sql.
-- Read-only assertions; raises an exception if the expected state is absent.

do $verify$
declare
  v_signature regprocedure;
  v_is_definer boolean;
  v_has_auth boolean;
  v_has_anon boolean;
  v_config text[];
  v_name text;
begin
  foreach v_name in array array[
    'public.get_financial_summary()',
    'public.review_payment_submission(uuid,boolean,text,text)',
    'public.review_private_document(uuid,boolean,text)',
    'public.set_current_committee_document(uuid)'
  ] loop
    v_signature := to_regprocedure(v_name);
    if v_signature is null then
      raise exception 'Missing public RPC: %', v_name;
    end if;
    select p.prosecdef,
           has_function_privilege('authenticated', p.oid, 'EXECUTE'),
           has_function_privilege('anon', p.oid, 'EXECUTE')
      into v_is_definer, v_has_auth, v_has_anon
    from pg_proc p where p.oid = v_signature;

    if v_is_definer then
      raise exception 'Public wrapper must be SECURITY INVOKER: %', v_name;
    end if;
    if not v_has_auth or v_has_anon then
      raise exception 'Unexpected public RPC grants: %', v_name;
    end if;
  end loop;

  foreach v_name in array array[
    'private.get_financial_summary()',
    'private.review_payment_submission(uuid,boolean,text,text)',
    'private.review_private_document(uuid,boolean,text)',
    'private.set_current_committee_document(uuid)'
  ] loop
    v_signature := to_regprocedure(v_name);
    if v_signature is null then
      raise exception 'Missing private helper: %', v_name;
    end if;
    select p.prosecdef,
           has_function_privilege('authenticated', p.oid, 'EXECUTE'),
           has_function_privilege('anon', p.oid, 'EXECUTE'),
           p.proconfig
      into v_is_definer, v_has_auth, v_has_anon, v_config
    from pg_proc p where p.oid = v_signature;

    if not v_is_definer then
      raise exception 'Private helper must be SECURITY DEFINER: %', v_name;
    end if;
    if not v_has_auth or v_has_anon then
      raise exception 'Unexpected private helper grants: %', v_name;
    end if;
    if not ('search_path=""' = any(coalesce(v_config, array[]::text[]))) then
      raise exception 'Private helper must pin an empty search_path: %', v_name;
    end if;
  end loop;

  if position('super_admin' in pg_get_functiondef(
       'private.get_financial_summary()'::regprocedure)) = 0
     or position('member' in pg_get_functiondef(
       'private.get_financial_summary()'::regprocedure)) = 0 then
    raise exception 'Financial summary role allow-list is missing';
  end if;

  if exists (
    select 1 from public.profiles
    where role not in ('member','super_admin') or role is null
  ) then
    raise exception 'Unexpected profile role remains after migration';
  end if;
end;
$verify$;

select
  'public wrappers are invoker; private helpers are definer; grants and role allow-list verified'
  as verification_result;
