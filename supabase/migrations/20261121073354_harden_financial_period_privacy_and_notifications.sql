CREATE OR REPLACE FUNCTION private.correct_financial_transactions(p_idempotency_key uuid, p_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_change record;
  v_current public.financial_transactions%rowtype;
  v_reverse_key uuid;
  v_post_key uuid;
  v_reversal_id uuid;
  v_posting_id uuid;
  v_saved integer := 0;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF v_actor IS NULL OR NOT (SELECT private.is_super_admin()) THEN
    RAISE EXCEPTION 'Super Admin permission required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR p_changes IS NULL
     OR jsonb_typeof(p_changes) <> 'array'
     OR jsonb_array_length(p_changes) < 1
     OR jsonb_array_length(p_changes) > 100 THEN
    RAISE EXCEPTION 'Provide 1 to 100 transaction corrections and an idempotency key';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_changes) e
    WHERE jsonb_typeof(e) <> 'object'
       OR NOT (e ? 'id' AND e ? 'amount' AND e ? 'transaction_date' AND e ? 'description')
       OR nullif(trim(e->>'id'),'') IS NULL
       OR nullif(trim(e->>'amount'),'') IS NULL
       OR nullif(trim(e->>'transaction_date'),'') IS NULL
  ) THEN
    RAISE EXCEPTION 'Each correction requires id, amount, transaction_date and description';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT (e->>'id')::uuid) FROM jsonb_array_elements(p_changes) e) THEN
    RAISE EXCEPTION 'Duplicate transaction IDs are not allowed';
  END IF;
  FOR v_change IN
    SELECT (e->>'id')::uuid AS id,
           (e->>'amount')::numeric AS amount,
           (e->>'transaction_date')::date AS transaction_date,
           nullif(trim(e->>'description'),'') AS description
    FROM jsonb_array_elements(p_changes) e ORDER BY 1
  LOOP
    IF v_change.amount IS NULL OR v_change.amount <= 0
       OR v_change.amount <> round(v_change.amount,2)
       OR v_change.amount > 999999999999.99
       OR v_change.transaction_date IS NULL THEN
      RAISE EXCEPTION 'Amount must be positive with at most two decimal places and date is required';
    END IF;
    IF v_change.transaction_date < DATE '2027-01-01'
       OR v_change.transaction_date > DATE '2031-12-31' THEN
      RAISE EXCEPTION 'Corrected transaction date must be within 1 January 2027–31 December 2031';
    END IF;
    SELECT * INTO v_current FROM public.financial_transactions
    WHERE id=v_change.id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found: %',v_change.id; END IF;
    IF v_current.posting_id IS NULL THEN RAISE EXCEPTION 'Transaction is not linked to a ledger posting'; END IF;
    IF v_current.transaction_type IN ('transfer','reversal')
       OR v_current.transfer_group_id IS NOT NULL
       OR v_current.reversal_of_id IS NOT NULL
       OR coalesce(v_current.reference_no,'') LIKE 'FFV_MATRIX|%' THEN
      RAISE EXCEPTION 'This transaction is locked; use its dedicated correction workflow';
    END IF;
    v_reverse_key := md5(p_idempotency_key::text || ':' || v_current.id::text || ':reverse')::uuid;
    v_post_key := md5(p_idempotency_key::text || ':' || v_current.id::text || ':post')::uuid;
    v_reversal_id := private.reverse_financial_posting(
      v_current.posting_id,v_reverse_key,
      'Super Admin correction for transaction ' || v_current.id::text
    );
    v_posting_id := private.post_financial_transaction(
      v_post_key,v_current.transaction_type,v_change.amount,v_change.transaction_date,
      v_current.account_type,v_current.direction,v_current.member_id,v_change.description,
      v_current.reference_no,v_current.category,v_current.project_name,NULL
    );
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'transaction_id',v_current.id,'reversal_posting_id',v_reversal_id,
      'replacement_posting_id',v_posting_id,'status','corrected'
    ));
    v_saved := v_saved + 1;
  END LOOP;
  RETURN jsonb_build_object('saved',v_saved,'corrections',v_result);
END;
$function$
;

CREATE OR REPLACE FUNCTION private.get_member_shared_financial_data_v2()
 RETURNS TABLE(member_id uuid, member_no text, full_name text, full_name_bn text, contribution_month date, amount numeric, paid_day integer, last_paid_at timestamp with time zone, total_paid numeric, total_due numeric, due_configured boolean, has_manual boolean, matrix_count integer, paid_date date)
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
    SELECT m.id,m.member_no::text,m.full_name::text,m.full_name_bn::text,
      greatest(date '2027-01-01',date_trunc('month',coalesce(m.contribution_start_date,m.joined_at))::date) AS contribution_start
    FROM public.members m WHERE m.status='active'
  ),
  month_grid AS (
    SELECT am.*,gs.month_start::date AS month_start
    FROM active_members am
    CROSS JOIN generate_series(date '2027-01-01',date '2031-12-01',interval '1 month') gs(month_start)
  ),
  attributed AS (
    SELECT t.*,
      CASE
        WHEN split_part(t.reference_no,'|',1)='FFV_MATRIX' AND split_part(t.reference_no,'|',2) ~ '^[0-9]{4}-[0-9]{2}$'
        THEN to_date(split_part(t.reference_no,'|',2)||'-01','YYYY-MM-DD')
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
    WHERE a.contribution_month_key >= date '2027-01-01'
      AND a.contribution_month_key < date '2032-01-01'
    GROUP BY a.member_id,a.contribution_month_key
  ),
  today AS (SELECT (now() AT TIME ZONE 'Asia/Dhaka')::date AS local_today),
  expected AS (
    SELECT mg.id AS member_id,sum(coalesce(rate.monthly_amount,2000))::numeric AS expected
    FROM month_grid mg CROSS JOIN today t
    LEFT JOIN LATERAL (
      SELECT cr.monthly_amount FROM public.member_contribution_rates cr
      WHERE cr.member_id=mg.id
        AND cr.effective_from <= (mg.month_start + interval '1 month - 1 day')::date
        AND (cr.effective_to IS NULL OR cr.effective_to >= mg.month_start)
      ORDER BY cr.effective_from DESC LIMIT 1
    ) rate ON true
    WHERE mg.month_start <= date_trunc('month',t.local_today)::date
      AND mg.month_start >= mg.contribution_start
    GROUP BY mg.id
  ),
  paid AS (
    SELECT a.member_id,sum(a.amount)::numeric AS total_paid FROM attributed a
    WHERE a.contribution_month_key >= date '2027-01-01'
      AND a.contribution_month_key < date '2032-01-01'
    GROUP BY a.member_id
  ),
  paid_to_date AS (
    SELECT a.member_id,sum(a.amount)::numeric AS paid_to_date
    FROM attributed a CROSS JOIN today t
    WHERE a.contribution_month_key >= date '2027-01-01'
      AND a.contribution_month_key <= date_trunc('month',t.local_today)::date
    GROUP BY a.member_id
  ),
  configured AS (SELECT id AS member_id FROM public.members WHERE status='active')
  SELECT mg.id,mg.member_no,mg.full_name,mg.full_name_bn,mg.month_start,
    coalesce(c.amount,0)::numeric,extract(day from c.paid_date)::integer,
    CASE WHEN (SELECT private.is_super_admin()) THEN c.last_paid_at ELSE NULL::timestamptz END,
    coalesce(p.total_paid,0)::numeric,
    greatest(0,coalesce(e.expected,0)-coalesce(ptd.paid_to_date,0))::numeric,
    (cfg.member_id IS NOT NULL),coalesce(c.has_manual,false),coalesce(c.matrix_count,0),c.paid_date
  FROM month_grid mg
  LEFT JOIN contributions c ON c.member_id=mg.id AND c.month_start=mg.month_start
  LEFT JOIN expected e ON e.member_id=mg.id
  LEFT JOIN paid p ON p.member_id=mg.id
  LEFT JOIN paid_to_date ptd ON ptd.member_id=mg.id
  LEFT JOIN configured cfg ON cfg.member_id=mg.id
  ORDER BY mg.member_no,mg.month_start;
END;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION private.post_financial_transaction(p_idempotency_key uuid, p_transaction_type text, p_amount numeric, p_transaction_date date, p_account_type text, p_direction text, p_member_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_reference_no text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_project_name text DEFAULT NULL::text, p_destination_account_type text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_posting_id uuid;
  v_existing_id uuid;
  v_existing_hash text;
  v_request_hash text;
  v_transfer_group_id uuid;
  v_matrix_month date;
BEGIN
  IF NOT (SELECT private.is_super_admin()) THEN
    RAISE EXCEPTION 'Super Admin permission required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;
  IF p_transaction_type NOT IN (
    'opening_balance','contribution','withdrawal','expense',
    'other_income','investment_profit','investment_loss','transfer'
  ) THEN
    RAISE EXCEPTION 'Unsupported transaction type';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount,2)
     OR p_amount > 999999999999.99 THEN
    RAISE EXCEPTION 'Amount must be positive and use no more than two decimal places';
  END IF;
  IF p_transaction_date IS NULL THEN
    RAISE EXCEPTION 'Transaction date is required';
  END IF;

  IF p_transaction_type = 'opening_balance' THEN
    IF p_transaction_date <> DATE '2027-01-01' THEN
      RAISE EXCEPTION 'Opening balance must be dated 1 January 2027';
    END IF;
  ELSIF p_transaction_type = 'contribution'
        AND coalesce(p_reference_no,'') LIKE 'FFV_MATRIX|%' THEN
    IF split_part(p_reference_no,'|',2) !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
      RAISE EXCEPTION 'Invalid contribution accounting month';
    END IF;
    v_matrix_month := to_date(split_part(p_reference_no,'|',2)||'-01','YYYY-MM-DD');
    IF v_matrix_month < DATE '2027-01-01' OR v_matrix_month > DATE '2031-12-01' THEN
      RAISE EXCEPTION 'Contribution accounting month must be within January 2027–December 2031';
    END IF;
  ELSIF p_transaction_date < DATE '2027-01-01'
        OR p_transaction_date > DATE '2031-12-31' THEN
    RAISE EXCEPTION 'Transaction date must be within 1 January 2027–31 December 2031';
  END IF;

  IF p_account_type NOT IN ('cash','bank','investment') THEN
    RAISE EXCEPTION 'Invalid source account';
  END IF;
  IF p_transaction_type = 'transfer' THEN
    IF p_direction <> 'out'
       OR p_destination_account_type NOT IN ('cash','bank','investment')
       OR p_destination_account_type = p_account_type
       OR p_member_id IS NOT NULL THEN
      RAISE EXCEPTION 'Transfer requires two different accounts, an outgoing source, and no member link';
    END IF;
  ELSE
    IF p_destination_account_type IS NOT NULL THEN
      RAISE EXCEPTION 'Destination account is only valid for transfers';
    END IF;
    IF (p_transaction_type IN ('opening_balance','contribution','other_income','investment_profit') AND p_direction <> 'in')
       OR (p_transaction_type IN ('withdrawal','expense','investment_loss') AND p_direction <> 'out') THEN
      RAISE EXCEPTION 'Direction does not match transaction type';
    END IF;
  END IF;
  IF p_transaction_type = 'contribution' THEN
    IF p_member_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.members m WHERE m.id = p_member_id AND m.status = 'active'
    ) THEN
      RAISE EXCEPTION 'Contribution requires an active member';
    END IF;
  END IF;

  v_request_hash := md5(jsonb_build_object(
    'actor',(SELECT auth.uid()),'type',p_transaction_type,'amount',p_amount,
    'date',p_transaction_date,'account',p_account_type,'direction',p_direction,
    'member',p_member_id,'description',p_description,'reference',p_reference_no,
    'category',p_category,'project',p_project_name,'destination',p_destination_account_type
  )::text);

  INSERT INTO public.financial_postings(idempotency_key,request_hash,posting_type,memo,created_by)
  VALUES (
    p_idempotency_key,v_request_hash,
    CASE WHEN p_transaction_type='transfer' THEN 'transfer' ELSE 'standard' END,
    p_description,(SELECT auth.uid())
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_posting_id;

  IF v_posting_id IS NULL THEN
    SELECT id,request_hash INTO v_existing_id,v_existing_hash
    FROM public.financial_postings WHERE idempotency_key=p_idempotency_key;
    IF v_existing_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION 'Idempotency key was already used for a different request';
    END IF;
    RETURN v_existing_id;
  END IF;

  IF p_transaction_type='transfer' THEN
    v_transfer_group_id := gen_random_uuid();
    INSERT INTO public.financial_transactions(
      posting_id,member_id,transaction_type,amount,transaction_date,description,
      reference_no,created_by,account_type,direction,category,project_name,transfer_group_id
    ) VALUES
    (v_posting_id,NULL,'transfer',p_amount,p_transaction_date,p_description,
     p_reference_no,(SELECT auth.uid()),p_account_type,'out',p_category,p_project_name,v_transfer_group_id),
    (v_posting_id,NULL,'transfer',p_amount,p_transaction_date,p_description,
     p_reference_no,(SELECT auth.uid()),p_destination_account_type,'in',p_category,p_project_name,v_transfer_group_id);
  ELSE
    INSERT INTO public.financial_transactions(
      posting_id,member_id,transaction_type,amount,transaction_date,description,
      reference_no,created_by,account_type,direction,category,project_name
    ) VALUES (
      v_posting_id,p_member_id,p_transaction_type,p_amount,p_transaction_date,p_description,
      p_reference_no,(SELECT auth.uid()),p_account_type,p_direction,p_category,p_project_name
    );
  END IF;
  RETURN v_posting_id;
END;
$function$
;

DROP POLICY IF EXISTS notifications_read_own_or_super_admin ON public.notifications;
CREATE POLICY notifications_read_own_or_super_admin ON public.notifications FOR SELECT TO authenticated
USING ((SELECT private.has_portal_access()) AND (user_id=(SELECT auth.uid()) OR (SELECT private.is_super_admin())));
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated
USING ((SELECT private.has_portal_access()) AND user_id=(SELECT auth.uid()))
WITH CHECK ((SELECT private.has_portal_access()) AND user_id=(SELECT auth.uid()));
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
REVOKE TRUNCATE,TRIGGER,REFERENCES ON ALL TABLES IN SCHEMA public FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE,TRIGGER,REFERENCES ON TABLES FROM authenticated;
