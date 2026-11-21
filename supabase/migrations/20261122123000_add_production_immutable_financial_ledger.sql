-- Production immutable, idempotent financial ledger parity.
-- STAGED ONLY. Refuses to run if Production already has ledger rows.
-- Development's three sample transactions/postings are deliberately excluded.
begin;
do $preflight$
begin
  if to_regclass('public.financial_postings') is not null then
    raise exception 'Preflight failed: public.financial_postings already exists';
  end if;
  if (select count(*) from public.financial_transactions) <> 0 then
    raise exception 'Preflight failed: Production financial_transactions is not empty; reviewed posting backfill required';
  end if;
  if (select count(*) from public.financial_transaction_audit) <> 0 then
    raise exception 'Preflight failed: Production financial audit contains rows; reconcile before applying';
  end if;
  if not exists (select 1 from pg_proc where oid=to_regprocedure('private.is_super_admin()')) then
    raise exception 'Preflight failed: private.is_super_admin() is missing';
  end if;
end
$preflight$;

create table public.financial_postings (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  request_hash text not null,
  posting_type text not null check (posting_type in ('standard','transfer','reversal')),
  memo text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  reversal_of_posting_id uuid unique references public.financial_postings(id),
  constraint financial_postings_reversal_type_check
    check ((posting_type='reversal')=(reversal_of_posting_id is not null))
);

alter table public.financial_transactions
  alter column amount type numeric(14,2) using amount::numeric(14,2),
  add column posting_id uuid not null references public.financial_postings(id),
  add column reversal_of_id uuid references public.financial_transactions(id);

alter table public.financial_transactions
  drop constraint financial_transactions_transaction_type_check,
  add constraint financial_transactions_transaction_type_check
    check (transaction_type = any (array[
      'opening_balance'::text,'contribution'::text,'withdrawal'::text,
      'expense'::text,'other_income'::text,'investment_profit'::text,
      'investment_loss'::text,'transfer'::text,'reversal'::text
    ])),
  add constraint financial_transactions_transfer_group_check
    check ((transaction_type='transfer')=(transfer_group_id is not null)),
  add constraint financial_transactions_reversal_reference_check
    check (transaction_type<>'reversal' or reversal_of_id is not null),
  add constraint financial_transactions_reversal_type_check
    check (reversal_of_id is null or transaction_type in ('reversal','transfer'));

create unique index financial_transactions_reversal_of_id_uidx
  on public.financial_transactions(reversal_of_id) where reversal_of_id is not null;
create index financial_transactions_posting_id_idx on public.financial_transactions(posting_id);
create index financial_transactions_reversal_of_id_idx
  on public.financial_transactions(reversal_of_id) where reversal_of_id is not null;
create index financial_postings_created_by_idx on public.financial_postings(created_by);

alter table public.financial_transaction_audit
  drop constraint financial_transaction_audit_action_check,
  add constraint financial_transaction_audit_action_check
  check (action in ('INSERT','UPDATE','DELETE'));

alter table public.financial_postings enable row level security;
create policy "Financial postings: Super Admin read"
  on public.financial_postings as permissive for select to authenticated
  using ((select private.is_super_admin()));

drop policy if exists "Transactions: Super Admin insert" on public.financial_transactions;
drop policy if exists "Transactions: Super Admin update" on public.financial_transactions;
drop policy if exists "Transactions: Super Admin delete" on public.financial_transactions;
revoke all on public.financial_postings from public,anon,authenticated;
grant select on public.financial_postings to authenticated;
grant all on public.financial_postings to service_role;

revoke all on public.financial_transactions from anon,authenticated;
grant select on public.financial_transactions to authenticated;
grant all on public.financial_transactions to service_role;

revoke all on public.financial_transaction_audit from anon,authenticated;
grant select on public.financial_transaction_audit to authenticated;
grant all on public.financial_transaction_audit to service_role;

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
$function$;


CREATE OR REPLACE FUNCTION private.reverse_financial_posting(p_original_posting_id uuid, p_idempotency_key uuid, p_reason text)
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
$function$;


CREATE OR REPLACE FUNCTION private.review_payment_submission(p_submission_id uuid, p_approved boolean, p_admin_note text DEFAULT NULL::text, p_account_type text DEFAULT 'cash'::text)
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


CREATE OR REPLACE FUNCTION public.post_financial_transaction(p_idempotency_key uuid, p_transaction_type text, p_amount numeric, p_transaction_date date, p_account_type text, p_direction text, p_member_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_reference_no text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_project_name text DEFAULT NULL::text, p_destination_account_type text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT private.post_financial_transaction(
    p_idempotency_key,p_transaction_type,p_amount,p_transaction_date,
    p_account_type,p_direction,p_member_id,p_description,p_reference_no,
    p_category,p_project_name,p_destination_account_type
  );
$function$;


CREATE OR REPLACE FUNCTION public.reverse_financial_posting(p_original_posting_id uuid, p_idempotency_key uuid, p_reason text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT private.reverse_financial_posting(
    p_original_posting_id,p_idempotency_key,p_reason
  );
$function$;


CREATE OR REPLACE FUNCTION public.correct_financial_transactions(p_idempotency_key uuid, p_changes jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT private.correct_financial_transactions(p_idempotency_key,p_changes);
$function$;


-- Replace the transitional Production summary with Development's
-- reversal-aware, accounting-period-aware calculation after reversal_of_id exists.
CREATE OR REPLACE FUNCTION private.get_financial_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT (SELECT private.has_portal_access()) THEN
    RAISE EXCEPTION 'Active committee portal access required' USING ERRCODE = '42501';
  END IF;
  RETURN private.get_financial_summary_unchecked();
END;
$function$;

CREATE OR REPLACE FUNCTION private.get_financial_summary_unchecked()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.role IN ('member', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Committee access required' USING ERRCODE = '42501';
  END IF;
  RETURN (WITH reporting AS (
    SELECT t.*,
      CASE
        WHEN t.transaction_type='contribution'
          AND split_part(coalesce(t.reference_no,''),'|',1)='FFV_MATRIX'
          AND split_part(coalesce(t.reference_no,''),'|',2) ~ '^[0-9]{4}-[0-9]{2}
before update or delete on public.financial_transactions
for each row execute function private.prevent_ledger_mutation();
create trigger prevent_financial_posting_mutation
before update or delete on public.financial_postings
for each row execute function private.prevent_ledger_mutation();
create constraint trigger validate_financial_transfer_group
after insert on public.financial_transactions
deferrable initially deferred
for each row execute function private.validate_transfer_group();


revoke all on function private.post_financial_transaction(uuid,text,numeric,date,text,text,uuid,text,text,text,text,text) from public,anon;
revoke all on function private.reverse_financial_posting(uuid,uuid,text) from public,anon;
revoke all on function private.correct_financial_transactions(uuid,jsonb) from public,anon;
revoke all on function private.review_payment_submission(uuid,boolean,text,text) from public,anon;
grant execute on function private.post_financial_transaction(uuid,text,numeric,date,text,text,uuid,text,text,text,text,text) to authenticated,service_role;
grant execute on function private.reverse_financial_posting(uuid,uuid,text) to authenticated,service_role;
grant execute on function private.correct_financial_transactions(uuid,jsonb) to authenticated;
grant execute on function private.review_payment_submission(uuid,boolean,text,text) to authenticated,service_role;

revoke all on function public.post_financial_transaction(uuid,text,numeric,date,text,text,uuid,text,text,text,text,text) from public,anon;
revoke all on function public.reverse_financial_posting(uuid,uuid,text) from public,anon;
revoke all on function public.correct_financial_transactions(uuid,jsonb) from public,anon;
grant execute on function public.post_financial_transaction(uuid,text,numeric,date,text,text,uuid,text,text,text,text,text) to authenticated,service_role;
grant execute on function public.reverse_financial_posting(uuid,uuid,text) to authenticated,service_role;
grant execute on function public.correct_financial_transactions(uuid,jsonb) to authenticated;

-- Production-only legacy edit RPC bypasses the immutable posting workflow.
-- Keep its definition for rollback history, but remove all API execution grants.
revoke all on function public.save_financial_transaction_edits(jsonb) from public,anon,authenticated,service_role;

revoke all on function private.prevent_ledger_mutation() from public,anon,authenticated;
revoke all on function private.validate_transfer_group() from public,anon,authenticated;
commit;

        THEN to_date(split_part(t.reference_no,'|',2)||'-01','YYYY-MM-DD')
        ELSE date_trunc('month',t.transaction_date)::date
      END AS report_month
    FROM public.financial_transactions t
  ),
  totals AS (
    SELECT
      coalesce(sum(case when account_type='cash' then case when direction='in' then amount else -amount end else 0 end),0) AS cash_balance,
      coalesce(sum(case when account_type='bank' then case when direction='in' then amount else -amount end else 0 end),0) AS bank_balance,
      coalesce(sum(case when account_type='investment' then case when direction='in' then amount else -amount end else 0 end),0) AS investment_balance,
      coalesce(sum(case when t.transaction_type='contribution' and t.direction='in' and t.report_month >= date '2027-01-01' and t.report_month < date '2032-01-01' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) AS total_contributions,
      coalesce(sum(case when t.transaction_type='expense' and t.direction='out' and t.report_month >= date '2027-01-01' and t.report_month < date '2032-01-01' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) AS total_expenses,
      coalesce(sum(case when t.transaction_type='other_income' and t.direction='in' and t.report_month >= date '2027-01-01' and t.report_month < date '2032-01-01' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) AS other_income,
      coalesce(sum(case when t.transaction_type='investment_profit' and t.direction='in' and t.report_month >= date '2027-01-01' and t.report_month < date '2032-01-01' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) AS investment_profit,
      coalesce(sum(case when t.transaction_type='investment_loss' and t.direction='out' and t.report_month >= date '2027-01-01' and t.report_month < date '2032-01-01' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) AS investment_loss,
      count(*) FILTER (WHERE t.report_month >= date '2027-01-01' AND t.report_month < date '2032-01-01') AS transaction_count,
      max(created_at) FILTER (WHERE t.report_month >= date '2027-01-01' AND t.report_month < date '2032-01-01') AS last_updated
    FROM reporting t
    WHERE t.report_month >= date '2027-01-01'
      AND t.report_month < date '2032-01-01'
  ),
  months AS (
    SELECT report_month AS month,
      coalesce(sum(case when t.transaction_type='contribution' and t.direction='in' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) AS contributions,
      coalesce(sum(case when t.transaction_type='expense' and t.direction='out' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) AS expenses,
      coalesce(sum(case when t.transaction_type in ('other_income','investment_profit') and t.direction='in' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) AS income,
      coalesce(sum(case when t.transaction_type='investment_loss' and t.direction='out' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) AS investment_loss
    FROM reporting t
    WHERE report_month >= date '2027-01-01' AND report_month < date '2032-01-01'
    GROUP BY 1 ORDER BY 1 DESC LIMIT 24
  ),
  halves AS (
    SELECT extract(year from report_month)::int AS yr,
      case when extract(month from report_month)<=6 then 1 else 2 end AS half,
      coalesce(sum(case when t.transaction_type='contribution' and t.direction='in' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) AS contributions,
      coalesce(sum(case when t.transaction_type='expense' and t.direction='out' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) AS expenses,
      coalesce(sum(case when t.transaction_type in ('other_income','investment_profit') and t.direction='in' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) AS income,
      coalesce(sum(case when t.transaction_type='investment_loss' and t.direction='out' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) AS investment_loss
    FROM reporting t
    WHERE report_month >= date '2027-01-01' AND report_month < date '2032-01-01'
    GROUP BY 1,2 ORDER BY 1 DESC,2 DESC LIMIT 12
  )
  SELECT jsonb_build_object(
    'cash_balance',t.cash_balance,'bank_balance',t.bank_balance,'investment_balance',t.investment_balance,
    'total_assets',t.cash_balance+t.bank_balance+t.investment_balance,
    'total_contributions',t.total_contributions,'total_expenses',t.total_expenses,
    'other_income',t.other_income,'investment_profit',t.investment_profit,'investment_loss',t.investment_loss,
    'net_operating_result',t.other_income+t.investment_profit-t.total_expenses-t.investment_loss,
    'transaction_count',t.transaction_count,'last_updated',t.last_updated,
    'monthly_trend',coalesce((select jsonb_agg(jsonb_build_object('month',to_char(m.month,'YYYY-MM'),'contributions',m.contributions,'expenses',m.expenses,'income',m.income,'investment_loss',m.investment_loss) order by m.month) from months m),'[]'::jsonb),
    'half_yearly_trend',coalesce((select jsonb_agg(jsonb_build_object('period',h.yr||'-H'||h.half,'year',h.yr,'half',h.half,'contributions',h.contributions,'expenses',h.expenses,'income',h.income,'investment_loss',h.investment_loss) order by h.yr,h.half) from halves h),'[]'::jsonb)
  )
  FROM totals t);
END;
$function$;

revoke all on function private.get_financial_summary_unchecked() from public,anon,authenticated,service_role;
revoke all on function private.get_financial_summary() from public,anon,service_role;
grant execute on function private.get_financial_summary() to authenticated;

-- Contribution matrix writes now use atomic immutable postings/reversals.
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
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
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
       OR v_change.contribution_month < DATE '2027-01-01'
       OR v_change.contribution_month >= DATE '2032-01-01'
       OR v_change.paid_date < DATE '2000-01-01'
       OR v_change.paid_date > v_today THEN
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
revoke all on function private.save_contribution_matrix(uuid,jsonb) from public,anon,service_role;
grant execute on function private.save_contribution_matrix(uuid,jsonb) to authenticated;

-- Member shared contribution matrix v2: reversal-aware, monthly due and
-- role-gated. This is the RPC used by the Development DATA page.
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
        WHEN split_part(t.reference_no,'|',1)='FFV_MATRIX' AND split_part(t.reference_no,'|',2) ~ '^[0-9]{4}-[0-9]{2}
before update or delete on public.financial_transactions
for each row execute function private.prevent_ledger_mutation();
create trigger prevent_financial_posting_mutation
before update or delete on public.financial_postings
for each row execute function private.prevent_ledger_mutation();
create constraint trigger validate_financial_transfer_group
after insert on public.financial_transactions
deferrable initially deferred
for each row execute function private.validate_transfer_group();


revoke all on function private.post_financial_transaction(uuid,text,numeric,date,text,text,uuid,text,text,text,text,text) from public,anon;
revoke all on function private.reverse_financial_posting(uuid,uuid,text) from public,anon;
revoke all on function private.correct_financial_transactions(uuid,jsonb) from public,anon;
revoke all on function private.review_payment_submission(uuid,boolean,text,text) from public,anon;
grant execute on function private.post_financial_transaction(uuid,text,numeric,date,text,text,uuid,text,text,text,text,text) to authenticated,service_role;
grant execute on function private.reverse_financial_posting(uuid,uuid,text) to authenticated,service_role;
grant execute on function private.correct_financial_transactions(uuid,jsonb) to authenticated;
grant execute on function private.review_payment_submission(uuid,boolean,text,text) to authenticated,service_role;

revoke all on function public.post_financial_transaction(uuid,text,numeric,date,text,text,uuid,text,text,text,text,text) from public,anon;
revoke all on function public.reverse_financial_posting(uuid,uuid,text) from public,anon;
revoke all on function public.correct_financial_transactions(uuid,jsonb) from public,anon;
grant execute on function public.post_financial_transaction(uuid,text,numeric,date,text,text,uuid,text,text,text,text,text) to authenticated,service_role;
grant execute on function public.reverse_financial_posting(uuid,uuid,text) to authenticated,service_role;
grant execute on function public.correct_financial_transactions(uuid,jsonb) to authenticated;

revoke all on function private.prevent_ledger_mutation() from public,anon,authenticated;
revoke all on function private.validate_transfer_group() from public,anon,authenticated;
commit;

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
$function$;
CREATE OR REPLACE FUNCTION public.get_member_shared_financial_data_v2()
 RETURNS TABLE(member_id uuid, member_no text, full_name text, full_name_bn text, contribution_month date, amount numeric, paid_day integer, last_paid_at timestamp with time zone, total_paid numeric, total_due numeric, due_configured boolean, has_manual boolean, matrix_count integer, paid_date date)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT * FROM private.get_member_shared_financial_data_v2();
$function$;
revoke all on function private.get_member_shared_financial_data_v2() from public,anon,service_role;
grant execute on function private.get_member_shared_financial_data_v2() to authenticated;
revoke all on function public.get_member_shared_financial_data_v2() from public,anon;
grant execute on function public.get_member_shared_financial_data_v2() to authenticated,service_role;

create trigger prevent_financial_transaction_mutation
before update or delete on public.financial_transactions
for each row execute function private.prevent_ledger_mutation();
create trigger prevent_financial_posting_mutation
before update or delete on public.financial_postings
for each row execute function private.prevent_ledger_mutation();
create constraint trigger validate_financial_transfer_group
after insert on public.financial_transactions
deferrable initially deferred
for each row execute function private.validate_transfer_group();


revoke all on function private.post_financial_transaction(uuid,text,numeric,date,text,text,uuid,text,text,text,text,text) from public,anon;
revoke all on function private.reverse_financial_posting(uuid,uuid,text) from public,anon;
revoke all on function private.correct_financial_transactions(uuid,jsonb) from public,anon;
revoke all on function private.review_payment_submission(uuid,boolean,text,text) from public,anon;
grant execute on function private.post_financial_transaction(uuid,text,numeric,date,text,text,uuid,text,text,text,text,text) to authenticated,service_role;
grant execute on function private.reverse_financial_posting(uuid,uuid,text) to authenticated,service_role;
grant execute on function private.correct_financial_transactions(uuid,jsonb) to authenticated;
grant execute on function private.review_payment_submission(uuid,boolean,text,text) to authenticated,service_role;

revoke all on function public.post_financial_transaction(uuid,text,numeric,date,text,text,uuid,text,text,text,text,text) from public,anon;
revoke all on function public.reverse_financial_posting(uuid,uuid,text) from public,anon;
revoke all on function public.correct_financial_transactions(uuid,jsonb) from public,anon;
grant execute on function public.post_financial_transaction(uuid,text,numeric,date,text,text,uuid,text,text,text,text,text) to authenticated,service_role;
grant execute on function public.reverse_financial_posting(uuid,uuid,text) to authenticated,service_role;
grant execute on function public.correct_financial_transactions(uuid,jsonb) to authenticated;

revoke all on function private.prevent_ledger_mutation() from public,anon,authenticated;
revoke all on function private.validate_transfer_group() from public,anon,authenticated;
commit;
