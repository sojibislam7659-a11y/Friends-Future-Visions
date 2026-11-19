BEGIN;


CREATE TABLE IF NOT EXISTS public.committee_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL UNIQUE,
  title text NOT NULL,
  body text NOT NULL,
  sort_order integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.committee_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "committee_rules_public_read" ON public.committee_rules;
DROP POLICY IF EXISTS "committee_rules_authenticated_read" ON public.committee_rules;
DROP POLICY IF EXISTS "Super Admin updates committee rules" ON public.committee_rules;
CREATE POLICY "committee_rules_public_read" ON public.committee_rules
  FOR SELECT TO anon USING (is_active);
CREATE POLICY "committee_rules_authenticated_read" ON public.committee_rules
  FOR SELECT TO authenticated USING (is_active OR private.is_super_admin());
CREATE POLICY "Super Admin updates committee rules" ON public.committee_rules
  FOR UPDATE TO authenticated USING (private.is_super_admin()) WITH CHECK (private.is_super_admin());
REVOKE ALL ON TABLE public.committee_rules FROM anon, authenticated;
GRANT SELECT ON TABLE public.committee_rules TO anon, authenticated;
GRANT UPDATE ON TABLE public.committee_rules TO authenticated;
GRANT ALL ON TABLE public.committee_rules TO service_role;
INSERT INTO public.committee_rules(rule_key,title,body,sort_order,is_active)
VALUES
('data-control','১. হিসাব ও ডেটা নিয়ন্ত্রণ','সব সদস্য-তথ্য, আর্থিক লেনদেন, ব্যালেন্স, প্রমাণপত্র ও নোটিশ শুধু Super Admin আপডেট করবেন।',1,true),
('member-access','২. সদস্যদের প্রবেশাধিকার','সদস্যরা প্রকাশিত সামগ্রিক হিসাব, নোটিশ, সদস্যদের নাম ও অনুমোদিত ছবি দেখতে পারবেন। ব্যক্তিগত তথ্য, জমা, বকেয়া এবং সদস্য/নমিনির NID বা পরিচয়পত্র শুধু সংশ্লিষ্ট সদস্য এবং Super Admin দেখতে পারবেন।',2,true),
('profile-changes','৩. প্রোফাইল পরিবর্তন','সদস্য নিজের তথ্য বা ছবি পরিবর্তনের অনুরোধ জমা দিতে পারবেন। Super Admin অনুমোদন না করা পর্যন্ত মূল প্রোফাইল পরিবর্তিত হবে না।',3,true),
('financial-terms','৪. আর্থিক শর্তাবলি','মাসিক জমার পরিমাণ, জমার শেষ তারিখ, বিলম্ব ফি, উত্তোলন, লাভ-ক্ষতি বণ্টন, সদস্যপদ বাতিল এবং সম্পত্তি/বিনিয়োগ সংক্রান্ত শর্তাবলি অনুমোদিত লিখিত নিয়ম থেকে যুক্ত করতে হবে। এই শর্তগুলো এখানে এখনো চূড়ান্তভাবে প্রকাশ করা হয়নি।',4,true),
('proofs','৫. প্রমাণপত্র','প্রতি মাসের সামগ্রিক ব্যাংক জমা বা বিনিয়োগের প্রমাণ Super Admin আপলোড করবেন। সদস্যরা শুধু দেখতে পারবেন।',5,true)
ON CONFLICT (rule_key) DO NOTHING;


CREATE OR REPLACE FUNCTION public.save_committee_proof_metadata(p_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_change record;
  v_saved integer := 0;
  v_rows integer;
BEGIN
  IF v_actor IS NULL OR NOT (SELECT private.is_super_admin()) THEN
    RAISE EXCEPTION 'Super Admin permission required' USING ERRCODE = '42501';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' OR jsonb_array_length(p_changes) > 200 THEN
    RAISE EXCEPTION 'Proof changes must be a JSON array of at most 200 items';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_changes) e
    WHERE jsonb_typeof(e) <> 'object'
       OR NOT (e ? 'id' AND e ? 'proof_month' AND e ? 'title' AND e ? 'note' AND e ? 'published')
       OR nullif(trim(e->>'title'),'') IS NULL
       OR length(e->>'title') > 180
       OR length(coalesce(e->>'note','')) > 500
  ) THEN
    RAISE EXCEPTION 'Each proof requires a valid ID, month, title, note and published flag';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT (e->>'id')::uuid) FROM jsonb_array_elements(p_changes) e) THEN
    RAISE EXCEPTION 'Duplicate proof IDs are not allowed';
  END IF;

  FOR v_change IN
    SELECT (e->>'id')::uuid AS id,
           (e->>'proof_month')::date AS proof_month,
           trim(e->>'title') AS title,
           nullif(trim(e->>'note'),'') AS note,
           (e->>'published')::boolean AS published
    FROM jsonb_array_elements(p_changes) e
    ORDER BY 1
  LOOP
    IF v_change.proof_month <> date_trunc('month',v_change.proof_month)::date
       OR v_change.proof_month < DATE '2026-12-01'
       OR v_change.proof_month >= DATE '2031-12-01' THEN
      RAISE EXCEPTION 'Proof month must be the first day of a month from Dec 2026 through Nov 2031';
    END IF;
    UPDATE public.committee_proofs
    SET proof_month=v_change.proof_month,title=v_change.title,note=v_change.note,published=v_change.published
    WHERE id=v_change.id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN RAISE EXCEPTION 'Proof not found: %',v_change.id; END IF;
    v_saved := v_saved + 1;
  END LOOP;
  RETURN jsonb_build_object('saved',v_saved);
END;
$function$


CREATE OR REPLACE FUNCTION public.save_committee_rules(p_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_change record;
  v_saved integer := 0;
  v_rows integer;
BEGIN
  IF v_actor IS NULL OR NOT (SELECT private.is_super_admin()) THEN
    RAISE EXCEPTION 'Super Admin permission required' USING ERRCODE = '42501';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' OR jsonb_array_length(p_changes) > 100 THEN
    RAISE EXCEPTION 'Rule changes must be a JSON array of at most 100 items';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_changes) e
    WHERE jsonb_typeof(e) <> 'object'
      OR NOT (e ? 'id' AND e ? 'title' AND e ? 'body' AND e ? 'sort_order' AND e ? 'is_active')
      OR nullif(trim(e->>'title'),'') IS NULL
      OR nullif(trim(e->>'body'),'') IS NULL
  ) THEN
    RAISE EXCEPTION 'Each rule needs id, title, body, sort_order and is_active';
  END IF;
  IF (
    SELECT count(*) <> count(DISTINCT (e->>'id')::uuid)
    FROM jsonb_array_elements(p_changes) e
  ) THEN
    RAISE EXCEPTION 'Duplicate rule IDs are not allowed';
  END IF;

  FOR v_change IN
    SELECT (e->>'id')::uuid AS id,
           trim(e->>'title') AS title,
           trim(e->>'body') AS body,
           (e->>'sort_order')::integer AS sort_order,
           (e->>'is_active')::boolean AS is_active
    FROM jsonb_array_elements(p_changes) e
    ORDER BY 4,1
  LOOP
    IF v_change.sort_order < 1 OR v_change.sort_order > 999 THEN
      RAISE EXCEPTION 'Rule order must be between 1 and 999';
    END IF;
    UPDATE public.committee_rules
    SET title=v_change.title, body=v_change.body, sort_order=v_change.sort_order,
        is_active=v_change.is_active, updated_at=now(), updated_by=v_actor
    WHERE id=v_change.id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN RAISE EXCEPTION 'Rule not found: %',v_change.id; END IF;
    v_saved := v_saved + 1;
  END LOOP;
  RETURN jsonb_build_object('saved',v_saved);
END;
$function$


CREATE OR REPLACE FUNCTION public.save_member_admin_profile(p_member_id uuid, p_changes jsonb, p_rate_amount numeric DEFAULT NULL::numeric, p_rate_effective_from date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_current public.members%rowtype;
  v_next public.members%rowtype;
BEGIN
  IF v_actor IS NULL OR NOT (SELECT private.is_super_admin()) THEN
    RAISE EXCEPTION 'Super Admin permission required' USING ERRCODE = '42501';
  END IF;
  IF p_member_id IS NULL OR p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' THEN
    RAISE EXCEPTION 'A member ID and a JSON object of changes are required';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_changes)) > 40 THEN
    RAISE EXCEPTION 'Too many profile fields in one save';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_changes) AS k(key)
    WHERE k.key <> ALL (ARRAY[
      'member_no','full_name','phone','status','joined_at','full_name_bn',
      'father_name','mother_name','spouse_name','date_of_birth','gender',
      'profession','email','alternate_phone','whatsapp','present_address',
      'permanent_address','district','upazila','emergency_contact_name',
      'emergency_contact_relation','emergency_contact_phone','nominee_name',
      'nominee_relation','nominee_phone','nominee_address','member_note',
      'joining_date','data_consent','account_consent','profile_photo_path',
      'nominee_photo_path'
    ])
  ) THEN
    RAISE EXCEPTION 'One or more profile fields are not editable';
  END IF;

  SELECT * INTO v_current
  FROM public.members
  WHERE id = p_member_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;

  SELECT * INTO v_next
  FROM jsonb_populate_record(v_current, p_changes) AS populated;

  IF v_next.full_name IS NULL OR length(trim(v_next.full_name)) = 0 THEN
    RAISE EXCEPTION 'Full name is required';
  END IF;
  IF v_next.joined_at IS NULL THEN RAISE EXCEPTION 'Joined date is required'; END IF;
  IF v_next.status NOT IN ('pending','active','inactive') THEN RAISE EXCEPTION 'Invalid member status'; END IF;
  IF v_next.date_of_birth IS NOT NULL AND v_next.date_of_birth > current_date THEN
    RAISE EXCEPTION 'Date of birth cannot be in the future';
  END IF;
  IF (p_rate_amount IS NULL) <> (p_rate_effective_from IS NULL) THEN
    RAISE EXCEPTION 'Rate amount and effective date must be provided together';
  END IF;
  IF p_rate_amount IS NOT NULL AND (
    p_rate_amount <= 0 OR p_rate_amount <> round(p_rate_amount,2)
    OR extract(day FROM p_rate_effective_from) <> 1
  ) THEN
    RAISE EXCEPTION 'Monthly rate must be positive and effective date must be the first day of a month';
  END IF;

  UPDATE public.members
  SET
    member_no=v_next.member_no, full_name=v_next.full_name, phone=v_next.phone,
    status=v_next.status, joined_at=v_next.joined_at, full_name_bn=v_next.full_name_bn,
    father_name=v_next.father_name, mother_name=v_next.mother_name, spouse_name=v_next.spouse_name,
    date_of_birth=v_next.date_of_birth, gender=v_next.gender, profession=v_next.profession,
    email=v_next.email, alternate_phone=v_next.alternate_phone, whatsapp=v_next.whatsapp,
    present_address=v_next.present_address, permanent_address=v_next.permanent_address,
    district=v_next.district, upazila=v_next.upazila,
    emergency_contact_name=v_next.emergency_contact_name,
    emergency_contact_relation=v_next.emergency_contact_relation,
    emergency_contact_phone=v_next.emergency_contact_phone,
    nominee_name=v_next.nominee_name, nominee_relation=v_next.nominee_relation,
    nominee_phone=v_next.nominee_phone, nominee_address=v_next.nominee_address,
    member_note=v_next.member_note, joining_date=v_next.joining_date,
    data_consent=v_next.data_consent, account_consent=v_next.account_consent,
    profile_photo_path=v_next.profile_photo_path, nominee_photo_path=v_next.nominee_photo_path
  WHERE id=p_member_id;

  IF p_rate_amount IS NOT NULL THEN
    PERFORM private.set_member_contribution_rate(p_member_id,p_rate_amount,p_rate_effective_from);
  END IF;
  RETURN jsonb_build_object('saved',true,'rate_saved',p_rate_amount IS NOT NULL);
END;
$function$


CREATE OR REPLACE FUNCTION public.save_member_contribution_rates(p_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_change record;
  v_count integer := 0;
BEGIN
  IF v_actor IS NULL OR NOT (SELECT private.is_super_admin()) THEN
    RAISE EXCEPTION 'Super Admin permission required' USING ERRCODE = '42501';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' OR jsonb_array_length(p_changes) > 100 THEN
    RAISE EXCEPTION 'Rate changes must be a JSON array of at most 100 items';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_changes) e
    WHERE jsonb_typeof(e) <> 'object'
       OR NOT (e ? 'member_id' AND e ? 'amount' AND e ? 'effective_from')
       OR nullif(trim(e->>'member_id'), '') IS NULL
       OR nullif(trim(e->>'amount'), '') IS NULL
       OR nullif(trim(e->>'effective_from'), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Each rate change requires member_id, amount, and effective_from';
  END IF;
  IF (
    SELECT count(*) <> count(DISTINCT ((e->>'member_id')::uuid)::text || '|' || (e->>'effective_from'))
    FROM jsonb_array_elements(p_changes) e
  ) THEN
    RAISE EXCEPTION 'Duplicate member/effective date rate changes are not allowed';
  END IF;

  FOR v_change IN
    SELECT
      (e->>'member_id')::uuid AS member_id,
      (e->>'amount')::numeric AS amount,
      (e->>'effective_from')::date AS effective_from
    FROM jsonb_array_elements(p_changes) e
    ORDER BY 1, 3
  LOOP
    PERFORM private.set_member_contribution_rate(
      v_change.member_id,
      v_change.amount,
      v_change.effective_from
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('saved', v_count);
END;
$function$


CREATE OR REPLACE FUNCTION public.save_notice_updates(p_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_change record;
  v_saved integer := 0;
  v_rows integer;
BEGIN
  IF v_actor IS NULL OR NOT (SELECT private.is_super_admin()) THEN
    RAISE EXCEPTION 'Super Admin permission required' USING ERRCODE = '42501';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' OR jsonb_array_length(p_changes) > 100 THEN
    RAISE EXCEPTION 'Notice changes must be a JSON array of at most 100 items';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_changes) e
    WHERE jsonb_typeof(e) <> 'object'
       OR NOT (e ? 'id' AND e ? 'title' AND e ? 'body' AND e ? 'notice_type' AND e ? 'meeting_at' AND e ? 'published')
       OR nullif(trim(e->>'title'),'') IS NULL
       OR nullif(trim(e->>'body'),'') IS NULL
       OR length(e->>'title') > 180
       OR length(e->>'body') > 5000
  ) THEN
    RAISE EXCEPTION 'Each notice needs a valid ID, title, body, type, meeting time and published flag';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT (e->>'id')::uuid) FROM jsonb_array_elements(p_changes) e) THEN
    RAISE EXCEPTION 'Duplicate notice IDs are not allowed';
  END IF;

  FOR v_change IN
    SELECT (e->>'id')::uuid AS id,
           trim(e->>'title') AS title,
           trim(e->>'body') AS body,
           e->>'notice_type' AS notice_type,
           nullif(e->>'meeting_at','')::timestamptz AS meeting_at,
           (e->>'published')::boolean AS published
    FROM jsonb_array_elements(p_changes) e
    ORDER BY 1
  LOOP
    IF v_change.notice_type NOT IN ('general','meeting','reminder') THEN
      RAISE EXCEPTION 'Invalid notice type';
    END IF;
    IF v_change.notice_type='meeting' AND v_change.meeting_at IS NULL THEN
      RAISE EXCEPTION 'Meeting notices require a date and time';
    END IF;
    UPDATE public.notices n
    SET title=v_change.title,
        body=v_change.body,
        notice_type=v_change.notice_type,
        meeting_at=v_change.meeting_at,
        published=v_change.published,
        published_at=CASE WHEN v_change.published THEN coalesce(n.published_at,now()) ELSE NULL END,
        updated_at=now()
    WHERE n.id=v_change.id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN RAISE EXCEPTION 'Notice not found: %',v_change.id; END IF;
    v_saved := v_saved + 1;
  END LOOP;
  RETURN jsonb_build_object('saved',v_saved);
END;
$function$


CREATE OR REPLACE FUNCTION private.get_member_shared_financial_data()
 RETURNS TABLE(member_id uuid, member_no text, full_name text, full_name_bn text, contribution_month date, amount numeric, paid_day integer, last_paid_at timestamp with time zone, total_paid numeric, total_due numeric, due_configured boolean, has_manual boolean, matrix_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('member','super_admin')) then
  raise exception 'Member access required' using errcode='42501';
 end if;
 return query
 with active_members as (
  select m.id,m.member_no::text,m.full_name::text,m.full_name_bn::text from public.members m where m.status='active'
 ), month_grid as (
  select am.*,gs.month_start::date as month_start from active_members am
  cross join generate_series(date '2026-12-01',date '2031-11-01',interval '1 month') gs(month_start)
 ), contributions as (
  select t.member_id,date_trunc('month',t.transaction_date)::date as month_start,
   sum(t.amount)::numeric as amount,max(t.transaction_date)::date as paid_date,
   max(coalesce(t.updated_at,t.created_at)) as last_paid_at,
   bool_or(coalesce(t.reference_no,'') not like 'FFV_MATRIX|%') as has_manual,
   count(*) filter(where coalesce(t.reference_no,'') like 'FFV_MATRIX|%')::integer as matrix_count
  from public.financial_transactions t
  where t.transaction_type='contribution' and t.direction='in'
   and t.transaction_date>=date '2026-12-01' and t.transaction_date<date '2031-12-01'
   and not exists(select 1 from public.financial_transactions r where r.reversal_of_id=t.id)
  group by t.member_id,date_trunc('month',t.transaction_date)::date
 ), expected as (
  select cr.member_id,sum(cr.monthly_amount)::numeric as expected
  from public.member_contribution_rates cr
  cross join generate_series(date '2026-12-01',date_trunc('month',current_date)::date,interval '1 month') g(month_start)
  where cr.effective_from <= (g.month_start + interval '1 month - 1 day')::date
   and (cr.effective_to is null or cr.effective_to >= g.month_start) and g.month_start<=current_date
  group by cr.member_id
 ), paid as (
  select t.member_id,sum(t.amount)::numeric as total_paid from public.financial_transactions t
  where t.transaction_type='contribution' and t.direction='in'
   and t.transaction_date>=date '2026-12-01' and t.transaction_date<=current_date
   and not exists(select 1 from public.financial_transactions r where r.reversal_of_id=t.id)
  group by t.member_id
 ), configured as (select cr.member_id from public.member_contribution_rates cr group by cr.member_id)
 select mg.id,mg.member_no,mg.full_name,mg.full_name_bn,mg.month_start,
  coalesce(c.amount,0)::numeric,extract(day from c.paid_date)::integer,c.last_paid_at,
  coalesce(p.total_paid,0)::numeric,greatest(0,coalesce(e.expected,0)-coalesce(p.total_paid,0))::numeric,
  (cfg.member_id is not null),coalesce(c.has_manual,false),coalesce(c.matrix_count,0)
 from month_grid mg left join contributions c on c.member_id=mg.id and c.month_start=mg.month_start
 left join expected e on e.member_id=mg.id left join paid p on p.member_id=mg.id
 left join configured cfg on cfg.member_id=mg.id order by mg.member_no,mg.month_start;
end;
$function$



CREATE OR REPLACE FUNCTION public.get_member_shared_financial_data()
RETURNS TABLE(
  member_id uuid, member_no text, full_name text, full_name_bn text,
  contribution_month date, amount numeric, paid_day integer,
  last_paid_at timestamp with time zone, total_paid numeric, total_due numeric,
  due_configured boolean, has_manual boolean, matrix_count integer
)
LANGUAGE sql
SET search_path TO ''
AS $function$
  SELECT * FROM private.get_member_shared_financial_data();
$function$;



CREATE OR REPLACE FUNCTION private.correct_financial_transactions(p_idempotency_key uuid,p_changes jsonb)
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
    FROM jsonb_array_elements(p_changes) e
    ORDER BY 1
  LOOP
    IF v_change.amount IS NULL OR v_change.amount <= 0
       OR v_change.amount <> round(v_change.amount,2)
       OR v_change.amount > 999999999999.99
       OR v_change.transaction_date IS NULL THEN
      RAISE EXCEPTION 'Amount must be positive with at most two decimal places and date is required';
    END IF;

    SELECT * INTO v_current
    FROM public.financial_transactions
    WHERE id=v_change.id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Transaction not found: %',v_change.id;
    END IF;
    IF v_current.posting_id IS NULL THEN
      RAISE EXCEPTION 'Transaction is not linked to a ledger posting';
    END IF;
    IF v_current.transaction_type IN ('transfer','reversal')
       OR v_current.transfer_group_id IS NOT NULL
       OR v_current.reversal_of_id IS NOT NULL
       OR coalesce(v_current.reference_no,'') LIKE 'FFV_MATRIX|%' THEN
      RAISE EXCEPTION 'This transaction is locked; use its dedicated correction workflow';
    END IF;

    v_reverse_key := md5(p_idempotency_key::text || ':' || v_current.id::text || ':reverse')::uuid;
    v_post_key := md5(p_idempotency_key::text || ':' || v_current.id::text || ':post')::uuid;

    v_reversal_id := private.reverse_financial_posting(
      v_current.posting_id,
      v_reverse_key,
      'Super Admin correction for transaction ' || v_current.id::text
    );

    v_posting_id := private.post_financial_transaction(
      v_post_key,
      v_current.transaction_type,
      v_change.amount,
      v_change.transaction_date,
      v_current.account_type,
      v_current.direction,
      v_current.member_id,
      v_change.description,
      v_current.reference_no,
      v_current.category,
      v_current.project_name,
      NULL
    );

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'transaction_id',v_current.id,
      'reversal_posting_id',v_reversal_id,
      'replacement_posting_id',v_posting_id,
      'status','corrected'
    ));
    v_saved := v_saved + 1;
  END LOOP;

  RETURN jsonb_build_object('saved',v_saved,'corrections',v_result);
END;
$function$;

CREATE OR REPLACE FUNCTION public.correct_financial_transactions(p_idempotency_key uuid,p_changes jsonb)
RETURNS jsonb
LANGUAGE sql
SET search_path TO ''
AS $function$
  SELECT private.correct_financial_transactions(p_idempotency_key,p_changes);
$function$;



GRANT USAGE ON SCHEMA private TO authenticated;
REVOKE ALL ON FUNCTION private.get_member_shared_financial_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_member_shared_financial_data() TO authenticated;
REVOKE ALL ON FUNCTION public.get_member_shared_financial_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_shared_financial_data() TO authenticated;
REVOKE ALL ON FUNCTION private.correct_financial_transactions(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.correct_financial_transactions(uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.correct_financial_transactions(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_financial_transactions(uuid,jsonb) TO authenticated;


REVOKE ALL ON FUNCTION public.save_member_contribution_rates(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_member_contribution_rates(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.save_committee_proof_metadata(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_committee_proof_metadata(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.save_notice_updates(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_notice_updates(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.save_member_admin_profile(uuid,jsonb,numeric,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_member_admin_profile(uuid,jsonb,numeric,date) TO authenticated;
REVOKE ALL ON FUNCTION public.save_committee_rules(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_committee_rules(jsonb) TO authenticated;

COMMIT;