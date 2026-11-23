-- Development-only immutable ledger and atomic posting workflow.
-- All financial writes are performed by trusted SECURITY DEFINER helpers.
-- No Production data or objects are modified.

CREATE TABLE public.financial_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  request_hash text NOT NULL,
  posting_type text NOT NULL CHECK (posting_type IN ('standard','transfer','reversal')),
  memo text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  reversal_of_posting_id uuid UNIQUE REFERENCES public.financial_postings(id),
  CONSTRAINT financial_postings_reversal_type_check
    CHECK ((posting_type = 'reversal') = (reversal_of_posting_id IS NOT NULL))
);

ALTER TABLE public.financial_transactions
  ALTER COLUMN amount TYPE numeric(14,2) USING amount::numeric(14,2);

ALTER TABLE public.financial_transactions
  ADD COLUMN posting_id uuid NOT NULL REFERENCES public.financial_postings(id),
  ADD COLUMN reversal_of_id uuid REFERENCES public.financial_transactions(id);

ALTER TABLE public.financial_transactions
  DROP CONSTRAINT financial_transactions_transaction_type_check;

ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_transactions_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY[
    'opening_balance'::text,
    'contribution'::text,
    'withdrawal'::text,
    'expense'::text,
    'other_income'::text,
    'investment_profit'::text,
    'investment_loss'::text,
    'transfer'::text,
    'reversal'::text
  ]));

ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_transactions_transfer_group_check
    CHECK ((transaction_type = 'transfer') = (transfer_group_id IS NOT NULL)),
  ADD CONSTRAINT financial_transactions_reversal_reference_check
    CHECK (transaction_type <> 'reversal' OR reversal_of_id IS NOT NULL),
  ADD CONSTRAINT financial_transactions_reversal_type_check
    CHECK (reversal_of_id IS NULL OR transaction_type IN ('reversal','transfer'));

CREATE UNIQUE INDEX financial_transactions_reversal_of_id_uidx
  ON public.financial_transactions(reversal_of_id)
  WHERE reversal_of_id IS NOT NULL;

CREATE INDEX financial_transactions_posting_id_idx
  ON public.financial_transactions(posting_id);

ALTER TABLE public.financial_postings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Financial postings: Super Admin read"
  ON public.financial_postings
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT private.is_super_admin()));

GRANT ALL ON public.financial_postings TO service_role;
GRANT SELECT ON public.financial_postings TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.financial_postings FROM authenticated;

GRANT SELECT ON public.financial_transactions TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.financial_transactions FROM authenticated;
GRANT ALL ON public.financial_transactions TO service_role;

CREATE OR REPLACE FUNCTION private.prevent_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION 'Posted financial records are immutable. Use the reversal workflow.'
    USING ERRCODE = '55000';
END;
$function$;

CREATE TRIGGER prevent_financial_transaction_mutation
BEFORE UPDATE OR DELETE ON public.financial_transactions
FOR EACH ROW EXECUTE FUNCTION private.prevent_ledger_mutation();

CREATE TRIGGER prevent_financial_posting_mutation
BEFORE UPDATE OR DELETE ON public.financial_postings
FOR EACH ROW EXECUTE FUNCTION private.prevent_ledger_mutation();

CREATE OR REPLACE FUNCTION private.validate_transfer_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_count integer;
  v_out_count integer;
  v_in_count integer;
  v_amount_count integer;
  v_account_count integer;
  v_posting_count integer;
BEGIN
  IF NEW.transaction_type <> 'transfer' THEN
    RETURN NULL;
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE direction = 'out'),
    count(*) FILTER (WHERE direction = 'in'),
    count(DISTINCT amount),
    count(DISTINCT account_type),
    count(DISTINCT posting_id)
  INTO v_count,v_out_count,v_in_count,v_amount_count,v_account_count,v_posting_count
  FROM public.financial_transactions
  WHERE transfer_group_id = NEW.transfer_group_id;

  IF v_count <> 2 OR v_out_count <> 1 OR v_in_count <> 1
     OR v_amount_count <> 1 OR v_account_count <> 2 OR v_posting_count <> 1 THEN
    RAISE EXCEPTION 'A transfer must contain exactly two equal, opposite entries across two different accounts in one posting.';
  END IF;

  RETURN NULL;
END;
$function$;

CREATE CONSTRAINT TRIGGER validate_financial_transfer_group
AFTER INSERT ON public.financial_transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION private.validate_transfer_group();

CREATE OR REPLACE FUNCTION private.post_financial_transaction(
  p_idempotency_key uuid,
  p_transaction_type text,
  p_amount numeric,
  p_transaction_date date,
  p_account_type text,
  p_direction text,
  p_member_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_reference_no text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_project_name text DEFAULT NULL,
  p_destination_account_type text DEFAULT NULL
)
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
    'actor',(SELECT auth.uid()),
    'type',p_transaction_type,
    'amount',p_amount,
    'date',p_transaction_date,
    'account',p_account_type,
    'direction',p_direction,
    'member',p_member_id,
    'description',p_description,
    'reference',p_reference_no,
    'category',p_category,
    'project',p_project_name,
    'destination',p_destination_account_type
  )::text);

  INSERT INTO public.financial_postings(idempotency_key,request_hash,posting_type,memo,created_by)
  VALUES (
    p_idempotency_key,
    v_request_hash,
    CASE WHEN p_transaction_type='transfer' THEN 'transfer' ELSE 'standard' END,
    p_description,
    (SELECT auth.uid())
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_posting_id;

  IF v_posting_id IS NULL THEN
    SELECT id,request_hash INTO v_existing_id,v_existing_hash
    FROM public.financial_postings
    WHERE idempotency_key=p_idempotency_key;
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
    (
      v_posting_id,NULL,'transfer',p_amount,p_transaction_date,p_description,
      p_reference_no,(SELECT auth.uid()),p_account_type,'out',p_category,p_project_name,v_transfer_group_id
    ),
    (
      v_posting_id,NULL,'transfer',p_amount,p_transaction_date,p_description,
      p_reference_no,(SELECT auth.uid()),p_destination_account_type,'in',p_category,p_project_name,v_transfer_group_id
    );
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
$function$;

CREATE OR REPLACE FUNCTION private.reverse_financial_posting(
  p_original_posting_id uuid,
  p_idempotency_key uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_original public.financial_postings%rowtype;
  v_posting_id uuid;
  v_existing_id uuid;
  v_existing_hash text;
  v_request_hash text;
  v_transfer_group_id uuid;
  v_count integer;
  v_out_count integer;
  v_in_count integer;
  v_amount_count integer;
  v_account_count integer;
BEGIN
  IF NOT (SELECT private.is_super_admin()) THEN
    RAISE EXCEPTION 'Super Admin permission required' USING ERRCODE = '42501';
  END IF;
  IF p_original_posting_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Original posting and idempotency key are required';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reversal reason of at least three characters is required';
  END IF;

  v_request_hash := md5(jsonb_build_object(
    'actor',(SELECT auth.uid()),
    'operation','reverse',
    'original',p_original_posting_id,
    'reason',trim(p_reason)
  )::text);

  SELECT id,request_hash INTO v_existing_id,v_existing_hash
  FROM public.financial_postings
  WHERE idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION 'Idempotency key was already used for a different request';
    END IF;
    RETURN v_existing_id;
  END IF;

  SELECT * INTO v_original
  FROM public.financial_postings
  WHERE id=p_original_posting_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original posting not found';
  END IF;
  IF v_original.posting_type='reversal' THEN
    RAISE EXCEPTION 'A reversal posting cannot itself be reversed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.financial_postings p
    WHERE p.reversal_of_posting_id=v_original.id
  ) THEN
    RAISE EXCEPTION 'This posting has already been reversed';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE direction='out'),
    count(*) FILTER (WHERE direction='in'),
    count(DISTINCT amount),
    count(DISTINCT account_type)
  INTO v_count,v_out_count,v_in_count,v_amount_count,v_account_count
  FROM public.financial_transactions
  WHERE posting_id=v_original.id;

  IF v_original.posting_type='transfer' THEN
    IF v_count<>2 OR v_out_count<>1 OR v_in_count<>1 OR v_amount_count<>1 OR v_account_count<>2 THEN
      RAISE EXCEPTION 'Original transfer is not balanced; reversal refused';
    END IF;
    v_transfer_group_id := gen_random_uuid();
  ELSE
    IF v_count<>1 THEN
      RAISE EXCEPTION 'Original standard posting must contain exactly one ledger entry';
    END IF;
  END IF;

  INSERT INTO public.financial_postings(
    idempotency_key,request_hash,posting_type,memo,created_by,reversal_of_posting_id
  ) VALUES (
    p_idempotency_key,v_request_hash,'reversal',trim(p_reason),(SELECT auth.uid()),v_original.id
  )
  RETURNING id INTO v_posting_id;

  INSERT INTO public.financial_transactions(
    posting_id,member_id,transaction_type,amount,transaction_date,description,
    reference_no,created_by,account_type,direction,category,project_name,
    transfer_group_id,reversal_of_id
  )
  SELECT
    v_posting_id,t.member_id,
    CASE WHEN v_original.posting_type='transfer' THEN 'transfer' ELSE 'reversal' END,
    t.amount,(now() AT TIME ZONE 'Asia/Dhaka')::date,
    'Reversal of posting '||v_original.id::text||': '||trim(p_reason),
    NULL,(SELECT auth.uid()),t.account_type,
    CASE WHEN t.direction='in' THEN 'out' ELSE 'in' END,
    t.category,t.project_name,
    CASE WHEN v_original.posting_type='transfer' THEN v_transfer_group_id ELSE NULL END,
    t.id
  FROM public.financial_transactions t
  WHERE t.posting_id=v_original.id;

  RETURN v_posting_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.post_financial_transaction(
  p_idempotency_key uuid,
  p_transaction_type text,
  p_amount numeric,
  p_transaction_date date,
  p_account_type text,
  p_direction text,
  p_member_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_reference_no text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_project_name text DEFAULT NULL,
  p_destination_account_type text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.post_financial_transaction(
    p_idempotency_key,p_transaction_type,p_amount,p_transaction_date,
    p_account_type,p_direction,p_member_id,p_description,p_reference_no,
    p_category,p_project_name,p_destination_account_type
  );
$function$;

CREATE OR REPLACE FUNCTION public.reverse_financial_posting(
  p_original_posting_id uuid,
  p_idempotency_key uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.reverse_financial_posting(
    p_original_posting_id,p_idempotency_key,p_reason
  );
$function$;

CREATE OR REPLACE FUNCTION private.review_payment_submission(
  p_submission_id uuid,
  p_approved boolean,
  p_admin_note text DEFAULT NULL::text,
  p_account_type text DEFAULT 'cash'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  r public.payment_submissions%rowtype;
BEGIN
  IF NOT (SELECT private.is_super_admin()) THEN
    RAISE EXCEPTION 'Super Admin permission required';
  END IF;
  IF p_approved IS NULL THEN
    RAISE EXCEPTION 'Approval decision is required';
  END IF;
  IF p_approved AND (p_account_type IS NULL OR p_account_type NOT IN ('cash','bank')) THEN
    RAISE EXCEPTION 'Account type must be cash or bank';
  END IF;

  SELECT * INTO r
  FROM public.payment_submissions
  WHERE id=p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment submission not found';
  END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'Payment submission already reviewed';
  END IF;

  IF p_approved THEN
    IF NULLIF(trim(r.reference_no),'') IS NULL THEN
      RAISE EXCEPTION 'Transaction ID is required';
    END IF;

    PERFORM private.post_financial_transaction(
      r.id,
      'contribution',
      r.amount,
      r.payment_date,
      p_account_type,
      'in',
      r.member_id,
      'Member payment approved (' || coalesce(r.payment_method,'payment') || ')',
      trim(r.reference_no),
      'member_contribution',
      NULL,
      NULL
    );
  END IF;

  UPDATE public.payment_submissions
  SET status=CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
      admin_note=p_admin_note,
      reviewed_by=(SELECT auth.uid()),
      reviewed_at=now()
  WHERE id=p_submission_id;
END;
$function$;

REVOKE ALL ON FUNCTION private.post_financial_transaction(uuid,text,numeric,date,text,text,uuid,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.reverse_financial_posting(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_financial_transaction(uuid,text,numeric,date,text,text,uuid,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_financial_posting(uuid,uuid,text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.post_financial_transaction(uuid,text,numeric,date,text,text,uuid,text,text,text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.reverse_financial_posting(uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_financial_transaction(uuid,text,numeric,date,text,text,uuid,text,text,text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_financial_posting(uuid,uuid,text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION private.prevent_ledger_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.validate_transfer_group() FROM PUBLIC, anon, authenticated;
