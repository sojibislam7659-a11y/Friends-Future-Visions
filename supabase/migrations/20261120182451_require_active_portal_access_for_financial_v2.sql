-- Keep shared financial data RPC restricted to active members and Super Admins.
CREATE OR REPLACE FUNCTION private.get_member_shared_financial_data_v2()
RETURNS TABLE(
  member_id uuid, member_no text, full_name text, full_name_bn text,
  contribution_month date, amount numeric, paid_day integer,
  last_paid_at timestamp with time zone, total_paid numeric,
  total_due numeric, due_configured boolean, has_manual boolean,
  matrix_count integer, paid_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (SELECT private.has_portal_access()) THEN
    RAISE EXCEPTION 'Member access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH active_members AS (
    SELECT m.id,m.member_no::text,m.full_name::text,m.full_name_bn::text
    FROM public.members m WHERE m.status='active'
  ),
  month_grid AS (
    SELECT am.*,gs.month_start::date AS month_start
    FROM active_members am
    CROSS JOIN generate_series(date '2026-12-01',date '2031-11-01',interval '1 month') gs(month_start)
  ),
  attributed AS (
    SELECT t.*,
      CASE
        WHEN split_part(t.reference_no,'|',1)='FFV_MATRIX' AND split_part(t.reference_no,'|',2) ~ '^[0-9]{4}-[0-9]{2}$' THEN to_date(split_part(t.reference_no,'|',2)||'-01','YYYY-MM-DD')
        ELSE date_trunc('month',t.transaction_date)::date
      END AS contribution_month_key
    FROM public.financial_transactions t
    WHERE t.transaction_type='contribution' AND t.direction='in'
      AND NOT EXISTS(SELECT 1 FROM public.financial_transactions r WHERE r.reversal_of_id=t.id)
  ),
  contributions AS (
    SELECT a.member_id,a.contribution_month_key AS month_start,
      sum(a.amount)::numeric AS amount,
      max(a.transaction_date)::date AS paid_date,
      max(coalesce(a.updated_at,a.created_at)) AS last_paid_at,
      bool_or(coalesce(a.reference_no,'') NOT LIKE 'FFV_MATRIX|%') AS has_manual,
      count(*) FILTER(WHERE coalesce(a.reference_no,'') LIKE 'FFV_MATRIX|%')::integer AS matrix_count
    FROM attributed a
    WHERE a.contribution_month_key >= date '2026-12-01'
      AND a.contribution_month_key < date '2031-12-01'
    GROUP BY a.member_id,a.contribution_month_key
  ),
  expected AS (
    SELECT cr.member_id,sum(cr.monthly_amount)::numeric AS expected
    FROM public.member_contribution_rates cr
    CROSS JOIN generate_series(date '2026-12-01',date_trunc('month',current_date)::date,interval '1 month') g(month_start)
    WHERE cr.effective_from <= (g.month_start + interval '1 month - 1 day')::date
      AND (cr.effective_to IS NULL OR cr.effective_to >= g.month_start)
      AND g.month_start <= current_date
    GROUP BY cr.member_id
  ),
  paid AS (
    SELECT a.member_id,sum(a.amount)::numeric AS total_paid
    FROM attributed a
    WHERE a.contribution_month_key >= date '2026-12-01'
      AND a.contribution_month_key <= date_trunc('month',current_date)::date
    GROUP BY a.member_id
  ),
  configured AS (SELECT cr.member_id FROM public.member_contribution_rates cr GROUP BY cr.member_id)
  SELECT mg.id,mg.member_no,mg.full_name,mg.full_name_bn,mg.month_start,
    coalesce(c.amount,0)::numeric,extract(day from c.paid_date)::integer,c.last_paid_at,
    coalesce(p.total_paid,0)::numeric,
    greatest(0,coalesce(e.expected,0)-coalesce(p.total_paid,0))::numeric,
    (cfg.member_id IS NOT NULL),coalesce(c.has_manual,false),coalesce(c.matrix_count,0),c.paid_date
  FROM month_grid mg
  LEFT JOIN contributions c ON c.member_id=mg.id AND c.month_start=mg.month_start
  LEFT JOIN expected e ON e.member_id=mg.id
  LEFT JOIN paid p ON p.member_id=mg.id
  LEFT JOIN configured cfg ON cfg.member_id=mg.id
  ORDER BY mg.member_no,mg.month_start;
END;
$function$;

REVOKE ALL ON FUNCTION private.get_member_shared_financial_data_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_member_shared_financial_data_v2() TO authenticated;
