-- Keep the dormant legacy helper aligned with the current accounting period.
-- Its public wrapper remains revoked; this prevents accidental re-enablement from restoring the old Dec 2026 range.
CREATE OR REPLACE FUNCTION private.get_member_shared_financial_data_unchecked()
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
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.role IN ('member','super_admin')
  ) THEN
    RAISE EXCEPTION 'Member access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT v2.member_id,v2.member_no,v2.full_name,v2.full_name_bn,
         v2.contribution_month,v2.amount,v2.paid_day,v2.last_paid_at,
         v2.total_paid,v2.total_due,v2.due_configured,v2.has_manual,v2.matrix_count
  FROM private.get_member_shared_financial_data_v2() v2;
END;
$function$;
