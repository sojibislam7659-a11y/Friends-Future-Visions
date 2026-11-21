-- Preserve legacy RPC signatures while enforcing the active portal-access rule.
-- The renamed implementation functions are callable only by their owner through these guarded wrappers.

ALTER FUNCTION private.get_financial_summary() RENAME TO get_financial_summary_unchecked;

CREATE FUNCTION private.get_financial_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (SELECT private.has_portal_access()) THEN
    RAISE EXCEPTION 'Active committee portal access required' USING ERRCODE = '42501';
  END IF;
  RETURN private.get_financial_summary_unchecked();
END;
$function$;

REVOKE ALL ON FUNCTION private.get_financial_summary_unchecked() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.get_financial_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_financial_summary() TO authenticated;

ALTER FUNCTION private.get_member_shared_financial_data() RENAME TO get_member_shared_financial_data_unchecked;

CREATE FUNCTION private.get_member_shared_financial_data()
RETURNS TABLE(
  member_id uuid,
  member_no text,
  full_name text,
  full_name_bn text,
  contribution_month date,
  amount numeric,
  paid_day integer,
  last_paid_at timestamp with time zone,
  total_paid numeric,
  total_due numeric,
  due_configured boolean,
  has_manual boolean,
  matrix_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (SELECT private.has_portal_access()) THEN
    RAISE EXCEPTION 'Active committee portal access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM private.get_member_shared_financial_data_unchecked();
END;
$function$;

REVOKE ALL ON FUNCTION private.get_member_shared_financial_data_unchecked() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.get_member_shared_financial_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_member_shared_financial_data() TO authenticated;
