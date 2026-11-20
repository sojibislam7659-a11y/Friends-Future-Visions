-- Keep accounting month independent from the real-world date money was received.
-- Matrix references identify the contribution month; transaction_date remains the actual payment date.

CREATE OR REPLACE FUNCTION private.save_contribution_matrix(p_idempotency_key uuid, p_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_hash text;
  v_existing_hash text;
  v_result jsonb;
  v_change record;
  v_reference text;
  v_reverse_key uuid;
  v_post_key uuid;
  v_manual_count integer;
  v_matrix_count integer;
  v_existing public.financial_transactions%rowtype;
  v_reversal_id uuid;
  v_new_posting_id uuid;
BEGIN
  IF NOT (SELECT private.is_super_admin()) THEN
    RAISE EXCEPTION 'Super Admin permission required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Authenticated idempotency key is required';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' THEN
    RAISE EXCEPTION 'Changes must be a JSON array';
  END IF;
  IF jsonb_array_length(p_changes) > 3000 THEN
    RAISE EXCEPTION 'A single matrix save cannot exceed 3000 cells';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_changes) e
    WHERE jsonb_typeof(e) <> 'object'
       OR NOT (e ? 'member_id' AND e ? 'month' AND e ? 'amount')
       OR nullif(trim(e->>'member_id'),'') IS NULL
       OR nullif(trim(e->>'month'),'') IS NULL
       OR nullif(trim(e->>'amount'),'') IS NULL
  ) THEN
    RAISE EXCEPTION 'Each matrix change requires non-empty member_id, month, and amount';
  END IF;
  IF (
    SELECT count(*) <> count(DISTINCT ((e->>'member_id')::uuid)::text || '|' || ((e->>'month')::date)::text)
    FROM jsonb_array_elements(p_changes) e
  ) THEN
    RAISE EXCEPTION 'Duplicate member/month cells are not allowed';
  END IF;

  v_hash := md5(jsonb_build_object('actor',v_actor,'changes',p_changes)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));

  SELECT request_hash,result INTO v_existing_hash,v_result
  FROM private.contribution_matrix_operations
  WHERE idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'Idempotency key was already used for a different matrix request';
    END IF;
    RETURN v_result;
  END IF;

  v_result := '[]'::jsonb;
  FOR v_change IN
    SELECT
      (e->>'member_id')::uuid AS member_id,
      (e->>'month')::date AS contribution_month,
      (e->>'amount')::numeric AS amount,
      COALESCE(NULLIF(e->>'paid_date','')::date, (e->>'month')::date) AS paid_date
    FROM jsonb_array_elements(p_changes) e
    ORDER BY 1,2
  LOOP
    IF v_change.contribution_month <> date_trunc('month',v_change.contribution_month)::date
       OR v_change.contribution_month < DATE '2026-12-01'
       OR v_change.contribution_month >= DATE '2031-12-01'
       OR v_change.paid_date < DATE '2000-01-01'
       OR v_change.paid_date > current_date + 1 THEN
      RAISE EXCEPTION 'Contribution month or actual payment date is outside the permitted range';
    END IF;
    IF v_change.amount IS NULL OR v_change.amount < 0
       OR v_change.amount <> round(v_change.amount,2)
       OR v_change.amount > 999999999999.99 THEN
      RAISE EXCEPTION 'Matrix amount must be zero or a positive amount with at most two decimal places';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_change.member_id::text || '|' || v_change.contribution_month::text,0));
    PERFORM 1 FROM public.members
      WHERE id=v_change.member_id AND status='active'
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Contribution Matrix requires an active member';
    END IF;

    v_reference := 'FFV_MATRIX|' || to_char(v_change.contribution_month,'YYYY-MM') || '|' || v_change.member_id::text;

    -- Manual contributions keep their existing calendar-month meaning.
    SELECT count(*) INTO v_manual_count
    FROM public.financial_transactions t
    WHERE t.member_id=v_change.member_id
      AND t.transaction_type='contribution'
      AND t.direction='in'
      AND t.transaction_date >= v_change.contribution_month
      AND t.transaction_date < (v_change.contribution_month + INTERVAL '1 month')::date
      AND NOT (t.reference_no=v_reference OR t.reference_no LIKE v_reference || '|%')
      AND NOT (t.reference_no LIKE 'FFV_MATRIX|%')
      AND NOT EXISTS (SELECT 1 FROM public.financial_transactions r WHERE r.reversal_of_id=t.id);
    IF v_manual_count > 0 THEN
      RAISE EXCEPTION 'This cell contains a manual contribution and is locked; do not overwrite ledger entries';
    END IF;

    -- Matrix rows are found by their accounting-month reference, not transaction_date.
    SELECT count(*) INTO v_matrix_count
    FROM public.financial_transactions t
    WHERE t.member_id=v_change.member_id
      AND t.transaction_type='contribution'
      AND t.direction='in'
      AND (t.reference_no=v_reference OR t.reference_no LIKE v_reference || '|%')
      AND NOT EXISTS (SELECT 1 FROM public.financial_transactions r WHERE r.reversal_of_id=t.id);
    IF v_matrix_count > 1 THEN
      RAISE EXCEPTION 'Duplicate active matrix postings found for this member/month; reconcile them before editing';
    END IF;

    v_existing := NULL;
    IF v_matrix_count = 1 THEN
      SELECT t.* INTO v_existing
      FROM public.financial_transactions t
      WHERE t.member_id=v_change.member_id
        AND t.transaction_type='contribution'
        AND t.direction='in'
        AND (t.reference_no=v_reference OR t.reference_no LIKE v_reference || '|%')
        AND NOT EXISTS (SELECT 1 FROM public.financial_transactions r WHERE r.reversal_of_id=t.id)
      FOR UPDATE;
    END IF;

    IF v_existing.id IS NOT NULL
       AND v_existing.amount = v_change.amount
       AND v_existing.transaction_date = v_change.paid_date THEN
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'member_id',v_change.member_id,'month',v_change.contribution_month,'amount',v_change.amount,'paid_date',v_change.paid_date,'status','unchanged'
      ));
      CONTINUE;
    END IF;

    v_reverse_key := md5(p_idempotency_key::text || ':' || v_change.member_id::text || ':' || v_change.contribution_month::text || ':reverse')::uuid;
    v_post_key := md5(p_idempotency_key::text || ':' || v_change.member_id::text || ':' || v_change.contribution_month::text || ':post')::uuid;
    v_reversal_id := NULL;
    v_new_posting_id := NULL;

    IF v_existing.id IS NOT NULL THEN
      v_reversal_id := private.reverse_financial_posting(
        v_existing.posting_id,
        v_reverse_key,
        'Contribution Matrix correction for ' || to_char(v_change.contribution_month,'YYYY-MM')
      );
    END IF;

    IF v_change.amount > 0 THEN
      v_new_posting_id := private.post_financial_transaction(
        v_post_key,'contribution',v_change.amount,v_change.paid_date,
        'bank','in',v_change.member_id,'Monthly contribution matrix',
        v_reference || '|' || v_post_key::text,NULL,NULL,NULL
      );
    END IF;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'member_id',v_change.member_id,
      'month',v_change.contribution_month,
      'amount',v_change.amount,
      'paid_date',v_change.paid_date,
      'status',CASE WHEN v_change.amount=0 THEN 'reversed_or_empty' ELSE 'saved' END,
      'reversal_posting_id',v_reversal_id,
      'posting_id',v_new_posting_id
    ));
  END LOOP;

  INSERT INTO private.contribution_matrix_operations(idempotency_key,request_hash,result,created_by)
  VALUES (p_idempotency_key,v_hash,v_result,v_actor);
  RETURN v_result;
END;
$function$;

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
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id=(SELECT auth.uid()) AND p.role IN ('member','super_admin')
  ) THEN
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

CREATE OR REPLACE FUNCTION public.get_member_shared_financial_data_v2()
RETURNS TABLE(
  member_id uuid, member_no text, full_name text, full_name_bn text,
  contribution_month date, amount numeric, paid_day integer,
  last_paid_at timestamp with time zone, total_paid numeric,
  total_due numeric, due_configured boolean, has_manual boolean,
  matrix_count integer, paid_date date
)
LANGUAGE sql
SET search_path TO ''
AS $function$
  SELECT * FROM private.get_member_shared_financial_data_v2();
$function$;

REVOKE ALL ON FUNCTION private.get_member_shared_financial_data_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_member_shared_financial_data_v2() TO authenticated;
REVOKE ALL ON FUNCTION public.get_member_shared_financial_data_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_shared_financial_data_v2() TO authenticated, service_role;
REVOKE ALL ON FUNCTION private.save_contribution_matrix(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.save_contribution_matrix(uuid,jsonb) TO authenticated;