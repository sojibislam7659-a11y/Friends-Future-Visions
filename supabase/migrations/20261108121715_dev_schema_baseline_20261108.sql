-- OIKKO DEVELOPMENT BASELINE reconstructed from Production's live catalog using read-only metadata queries.

-- No Production rows, Auth users, Storage objects, or Vault secrets are copied.

-- Development-only security adjustment: omit direct financial_transactions INSERT/UPDATE/DELETE policies and grants.

CREATE SCHEMA IF NOT EXISTS private;

CREATE SEQUENCE IF NOT EXISTS public.member_no_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;

CREATE TABLE public.committee_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  doc_type text NOT NULL,
  title text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  is_current boolean DEFAULT true NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.committee_proofs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  proof_month date NOT NULL,
  title text NOT NULL,
  storage_path text NOT NULL,
  note text,
  published boolean DEFAULT true NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.financial_transaction_audit (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  transaction_id uuid,
  action text NOT NULL,
  old_record jsonb,
  new_record jsonb,
  changed_by uuid,
  changed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.financial_transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  member_id uuid,
  transaction_type text NOT NULL,
  amount numeric(12,2) NOT NULL,
  transaction_date date DEFAULT CURRENT_DATE NOT NULL,
  description text,
  reference_no text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  account_type text DEFAULT 'bank'::text NOT NULL,
  direction text DEFAULT 'in'::text NOT NULL,
  category text,
  project_name text,
  transfer_group_id uuid,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid
);

CREATE TABLE public.member_contribution_rates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  member_id uuid NOT NULL,
  monthly_amount numeric(14,2) NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.member_directory (
  member_id uuid NOT NULL,
  member_no text,
  full_name text NOT NULL,
  full_name_bn text,
  profile_photo_path text,
  status text NOT NULL
);

CREATE TABLE public.member_private_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  member_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  document_type text NOT NULL,
  storage_path text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  member_no text,
  full_name text NOT NULL,
  phone text,
  auth_user_id uuid,
  status text DEFAULT 'pending'::text NOT NULL,
  joined_at date DEFAULT CURRENT_DATE NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  full_name_bn text,
  father_name text,
  mother_name text,
  spouse_name text,
  date_of_birth date,
  gender text,
  profession text,
  email text,
  alternate_phone text,
  whatsapp text,
  present_address text,
  permanent_address text,
  district text,
  upazila text,
  emergency_contact_name text,
  emergency_contact_relation text,
  emergency_contact_phone text,
  nominee_name text,
  nominee_relation text,
  nominee_phone text,
  nominee_address text,
  member_note text,
  joining_date date,
  data_consent text,
  account_consent text,
  form_response_id text,
  profile_photo_path text,
  monthly_contribution numeric(14,2),
  contribution_start_date date,
  nominee_photo_path text
);

CREATE TABLE public.notices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  notice_type text DEFAULT 'general'::text NOT NULL,
  meeting_at timestamp with time zone,
  published boolean DEFAULT false NOT NULL,
  published_at timestamp with time zone,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  notice_id uuid,
  title text NOT NULL,
  body text NOT NULL,
  notification_type text DEFAULT 'general'::text NOT NULL,
  scheduled_for timestamp with time zone,
  sent_at timestamp with time zone,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  push_sent_at timestamp with time zone,
  push_attempts integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.payment_methods (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  method text NOT NULL,
  account_name text,
  account_number text,
  qr_path text,
  active boolean DEFAULT true NOT NULL,
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.payment_submissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  member_id uuid NOT NULL,
  submitted_by uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  payment_date date DEFAULT CURRENT_DATE NOT NULL,
  payment_method text,
  reference_no text,
  proof_path text,
  status text DEFAULT 'pending'::text NOT NULL,
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.profile_change_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  member_id uuid NOT NULL,
  submitted_by uuid DEFAULT auth.uid() NOT NULL,
  requested_changes jsonb DEFAULT '{}'::jsonb NOT NULL,
  requested_photo_path text,
  status text DEFAULT 'pending'::text NOT NULL,
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  full_name text NOT NULL,
  role text DEFAULT 'member'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  email text,
  email_verified_at timestamp with time zone
);

CREATE TABLE public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  user_agent text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY committee_documents ADD CONSTRAINT committee_documents_pkey PRIMARY KEY (id);
ALTER TABLE ONLY committee_proofs ADD CONSTRAINT committee_proofs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY financial_transaction_audit ADD CONSTRAINT financial_transaction_audit_pkey PRIMARY KEY (id);
ALTER TABLE ONLY financial_transactions ADD CONSTRAINT financial_transactions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY member_contribution_rates ADD CONSTRAINT member_contribution_rates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY member_directory ADD CONSTRAINT member_directory_pkey PRIMARY KEY (member_id);
ALTER TABLE ONLY member_private_documents ADD CONSTRAINT member_private_documents_pkey PRIMARY KEY (id);
ALTER TABLE ONLY members ADD CONSTRAINT members_pkey PRIMARY KEY (id);
ALTER TABLE ONLY notices ADD CONSTRAINT notices_pkey PRIMARY KEY (id);
ALTER TABLE ONLY notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY payment_methods ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);
ALTER TABLE ONLY payment_submissions ADD CONSTRAINT payment_submissions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY profile_change_requests ADD CONSTRAINT profile_change_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY push_subscriptions ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY committee_documents ADD CONSTRAINT committee_documents_storage_path_key UNIQUE (storage_path);
ALTER TABLE ONLY committee_proofs ADD CONSTRAINT committee_proofs_storage_path_key UNIQUE (storage_path);
ALTER TABLE ONLY member_contribution_rates ADD CONSTRAINT member_contribution_rates_member_id_effective_from_key UNIQUE (member_id, effective_from);
ALTER TABLE ONLY member_private_documents ADD CONSTRAINT member_private_documents_storage_path_key UNIQUE (storage_path);
ALTER TABLE ONLY members ADD CONSTRAINT members_auth_user_id_key UNIQUE (auth_user_id);
ALTER TABLE ONLY members ADD CONSTRAINT members_form_response_id_key UNIQUE (form_response_id);
ALTER TABLE ONLY members ADD CONSTRAINT members_member_no_key UNIQUE (member_no);
ALTER TABLE ONLY payment_methods ADD CONSTRAINT payment_methods_method_key UNIQUE (method);
ALTER TABLE ONLY push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
ALTER TABLE ONLY committee_documents ADD CONSTRAINT committee_documents_doc_type_check CHECK (doc_type = 'deed'::text);
ALTER TABLE ONLY financial_transaction_audit ADD CONSTRAINT financial_transaction_audit_action_check CHECK (action = ANY (ARRAY['UPDATE'::text, 'DELETE'::text]));
ALTER TABLE ONLY financial_transactions ADD CONSTRAINT financial_transactions_account_type_check CHECK (account_type = ANY (ARRAY['cash'::text, 'bank'::text, 'investment'::text]));
ALTER TABLE ONLY financial_transactions ADD CONSTRAINT financial_transactions_amount_check CHECK (amount > 0::numeric);
ALTER TABLE ONLY financial_transactions ADD CONSTRAINT financial_transactions_direction_check CHECK (direction = ANY (ARRAY['in'::text, 'out'::text]));
ALTER TABLE ONLY financial_transactions ADD CONSTRAINT financial_transactions_transaction_type_check CHECK (transaction_type = ANY (ARRAY['opening_balance'::text, 'contribution'::text, 'withdrawal'::text, 'expense'::text, 'other_income'::text, 'investment_profit'::text, 'investment_loss'::text, 'transfer'::text]));
ALTER TABLE ONLY member_contribution_rates ADD CONSTRAINT contribution_rate_date_range CHECK (effective_to IS NULL OR effective_to >= effective_from);
ALTER TABLE ONLY member_contribution_rates ADD CONSTRAINT contribution_rate_starts_month CHECK (EXTRACT(day FROM effective_from) = 1::numeric);
ALTER TABLE ONLY member_contribution_rates ADD CONSTRAINT member_contribution_rates_monthly_amount_check CHECK (monthly_amount > 0::numeric);
ALTER TABLE ONLY member_private_documents ADD CONSTRAINT member_private_documents_document_type_check CHECK (document_type = ANY (ARRAY['member_nid'::text, 'nominee_nid'::text, 'nominee_photo'::text]));
ALTER TABLE ONLY member_private_documents ADD CONSTRAINT member_private_documents_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]));
ALTER TABLE ONLY members ADD CONSTRAINT members_status_check CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'inactive'::text]));
ALTER TABLE ONLY notices ADD CONSTRAINT meeting_notice_requires_time CHECK (notice_type <> 'meeting'::text OR meeting_at IS NOT NULL);
ALTER TABLE ONLY notices ADD CONSTRAINT notices_body_check CHECK (char_length(TRIM(BOTH FROM body)) >= 1 AND char_length(TRIM(BOTH FROM body)) <= 5000);
ALTER TABLE ONLY notices ADD CONSTRAINT notices_notice_type_check CHECK (notice_type = ANY (ARRAY['general'::text, 'meeting'::text, 'reminder'::text]));
ALTER TABLE ONLY notices ADD CONSTRAINT notices_title_check CHECK (char_length(TRIM(BOTH FROM title)) >= 1 AND char_length(TRIM(BOTH FROM title)) <= 180);
ALTER TABLE ONLY notifications ADD CONSTRAINT notifications_notification_type_check CHECK (notification_type = ANY (ARRAY['general'::text, 'monthly_due'::text, 'meeting_reminder'::text]));
ALTER TABLE ONLY payment_methods ADD CONSTRAINT payment_methods_method_check CHECK (method = ANY (ARRAY['bkash'::text, 'nagad'::text]));
ALTER TABLE ONLY payment_submissions ADD CONSTRAINT payment_submissions_amount_check CHECK (amount > 0::numeric);
ALTER TABLE ONLY payment_submissions ADD CONSTRAINT payment_submissions_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]));
ALTER TABLE ONLY profile_change_requests ADD CONSTRAINT profile_change_requests_nonempty CHECK (requested_changes <> '{}'::jsonb OR requested_photo_path IS NOT NULL);
ALTER TABLE ONLY profile_change_requests ADD CONSTRAINT profile_change_requests_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]));
ALTER TABLE ONLY profiles ADD CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['super_admin'::text, 'member'::text, 'pending'::text, 'rejected'::text]));
ALTER TABLE ONLY committee_documents ADD CONSTRAINT committee_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);
ALTER TABLE ONLY committee_proofs ADD CONSTRAINT committee_proofs_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);
ALTER TABLE ONLY financial_transactions ADD CONSTRAINT financial_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY financial_transactions ADD CONSTRAINT financial_transactions_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id);
ALTER TABLE ONLY financial_transactions ADD CONSTRAINT financial_transactions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE ONLY member_contribution_rates ADD CONSTRAINT member_contribution_rates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY member_contribution_rates ADD CONSTRAINT member_contribution_rates_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE ONLY member_directory ADD CONSTRAINT member_directory_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE ONLY member_private_documents ADD CONSTRAINT member_private_documents_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE ONLY member_private_documents ADD CONSTRAINT member_private_documents_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id);
ALTER TABLE ONLY member_private_documents ADD CONSTRAINT member_private_documents_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
ALTER TABLE ONLY members ADD CONSTRAINT members_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY notices ADD CONSTRAINT notices_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY notifications ADD CONSTRAINT notifications_notice_id_fkey FOREIGN KEY (notice_id) REFERENCES notices(id) ON DELETE CASCADE;
ALTER TABLE ONLY notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY payment_methods ADD CONSTRAINT payment_methods_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE ONLY payment_submissions ADD CONSTRAINT payment_submissions_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id);
ALTER TABLE ONLY payment_submissions ADD CONSTRAINT payment_submissions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
ALTER TABLE ONLY payment_submissions ADD CONSTRAINT payment_submissions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id);
ALTER TABLE ONLY profile_change_requests ADD CONSTRAINT profile_change_requests_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE ONLY profile_change_requests ADD CONSTRAINT profile_change_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
ALTER TABLE ONLY profile_change_requests ADD CONSTRAINT profile_change_requests_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id);
ALTER TABLE ONLY profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX committee_documents_one_current_per_type ON public.committee_documents USING btree (doc_type) WHERE (is_current = true);

CREATE INDEX committee_proofs_published_month_idx ON public.committee_proofs USING btree (proof_month, created_at DESC) WHERE (published = true);

CREATE INDEX idx_committee_proofs_month ON public.committee_proofs USING btree (proof_month DESC);

CREATE INDEX idx_committee_proofs_uploaded_by ON public.committee_proofs USING btree (uploaded_by);

CREATE UNIQUE INDEX financial_contribution_reference_unique ON public.financial_transactions USING btree (lower(TRIM(BOTH FROM reference_no))) WHERE ((transaction_type = 'contribution'::text) AND (reference_no IS NOT NULL) AND (TRIM(BOTH FROM reference_no) <> ''::text));

CREATE UNIQUE INDEX financial_transactions_matrix_reference_uidx ON public.financial_transactions USING btree (reference_no) WHERE (reference_no ~~ 'FFV_MATRIX|%'::text);

CREATE INDEX financial_transactions_member_contribution_idx ON public.financial_transactions USING btree (member_id, transaction_date) WHERE ((transaction_type = 'contribution'::text) AND (direction = 'in'::text));

CREATE INDEX idx_financial_transactions_account_date ON public.financial_transactions USING btree (account_type, transaction_date DESC);

CREATE INDEX idx_financial_transactions_created_by ON public.financial_transactions USING btree (created_by);

CREATE INDEX idx_financial_transactions_date ON public.financial_transactions USING btree (transaction_date DESC);

CREATE INDEX idx_financial_transactions_member_id ON public.financial_transactions USING btree (member_id);

CREATE INDEX idx_financial_transactions_updated_by ON public.financial_transactions USING btree (updated_by);

CREATE INDEX idx_contribution_rates_member_effective ON public.member_contribution_rates USING btree (member_id, effective_from DESC);

CREATE INDEX idx_member_contribution_rates_created_by ON public.member_contribution_rates USING btree (created_by);

CREATE INDEX member_private_documents_owner_status_idx ON public.member_private_documents USING btree (owner_user_id, status, uploaded_at DESC);

CREATE INDEX idx_members_auth_user_id ON public.members USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);

CREATE INDEX idx_notices_created_by ON public.notices USING btree (created_by);

CREATE INDEX idx_notifications_notice_id ON public.notifications USING btree (notice_id);

CREATE UNIQUE INDEX notifications_notice_once_idx ON public.notifications USING btree (user_id, notice_id, notification_type) WHERE (notice_id IS NOT NULL);

CREATE INDEX notifications_unread_by_user_idx ON public.notifications USING btree (user_id, created_at DESC) WHERE (read_at IS NULL);

CREATE INDEX notifications_user_created_idx ON public.notifications USING btree (user_id, created_at DESC);

CREATE INDEX idx_payment_submissions_member_id ON public.payment_submissions USING btree (member_id);

CREATE INDEX idx_payment_submissions_reviewed_by ON public.payment_submissions USING btree (reviewed_by);

CREATE INDEX idx_payment_submissions_submitted_by ON public.payment_submissions USING btree (submitted_by);

CREATE INDEX payment_submissions_owner_status_idx ON public.payment_submissions USING btree (submitted_by, status, created_at DESC);

CREATE UNIQUE INDEX payment_submissions_reference_unique ON public.payment_submissions USING btree (lower(TRIM(BOTH FROM reference_no))) WHERE ((reference_no IS NOT NULL) AND (TRIM(BOTH FROM reference_no) <> ''::text));

CREATE INDEX idx_profile_change_requests_member_id ON public.profile_change_requests USING btree (member_id);

CREATE INDEX idx_profile_change_requests_reviewed_by ON public.profile_change_requests USING btree (reviewed_by);

CREATE INDEX idx_profile_change_requests_submitted_by ON public.profile_change_requests USING btree (submitted_by);

CREATE INDEX profile_change_requests_owner_created_idx ON public.profile_change_requests USING btree (submitted_by, created_at DESC);

CREATE UNIQUE INDEX profiles_email_lower_uidx ON public.profiles USING btree (lower(email)) WHERE (email IS NOT NULL);

CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions USING btree (user_id);

CREATE OR REPLACE FUNCTION private.has_portal_access()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('super_admin','admin','member')
  );
$function$;


CREATE OR REPLACE FUNCTION private.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'super_admin'
  );
$function$;


CREATE OR REPLACE FUNCTION private.audit_financial_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.financial_transaction_audit
    (transaction_id, action, old_record, new_record, changed_by)
  values (
    old.id,
    tg_op,
    to_jsonb(old),
    case when tg_op = 'UPDATE' then to_jsonb(new) else null end,
    (select auth.uid())
  );
  if tg_op = 'DELETE' then return old; end if;
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.audit_financial_transaction_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.financial_transaction_audit
    (transaction_id,action,old_record,new_record,changed_by)
  values (new.id,'INSERT',null,to_jsonb(new),(select auth.uid()));
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.get_financial_summary()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with totals as (
  select
    coalesce(sum(case when account_type='cash' then case when direction='in' then amount else -amount end else 0 end),0) as cash_balance,
    coalesce(sum(case when account_type='bank' then case when direction='in' then amount else -amount end else 0 end),0) as bank_balance,
    coalesce(sum(case when account_type='investment' then case when direction='in' then amount else -amount end else 0 end),0) as investment_balance,
    coalesce(sum(case when transaction_type='contribution' and direction='in' then amount else 0 end),0) as total_contributions,
    coalesce(sum(case when transaction_type='expense' and direction='out' then amount else 0 end),0) as total_expenses,
    coalesce(sum(case when transaction_type='other_income' and direction='in' then amount else 0 end),0) as other_income,
    coalesce(sum(case when transaction_type='investment_profit' and direction='in' then amount else 0 end),0) as investment_profit,
    coalesce(sum(case when transaction_type='investment_loss' and direction='out' then amount else 0 end),0) as investment_loss,
    count(*) as transaction_count,
    max(created_at) as last_updated
  from public.financial_transactions
),
months as (
  select date_trunc('month',transaction_date)::date as month,
    coalesce(sum(case when transaction_type='contribution' and direction='in' then amount else 0 end),0) as contributions,
    coalesce(sum(case when transaction_type='expense' and direction='out' then amount else 0 end),0) as expenses,
    coalesce(sum(case when transaction_type in ('other_income','investment_profit') and direction='in' then amount else 0 end),0) as income,
    coalesce(sum(case when transaction_type='investment_loss' and direction='out' then amount else 0 end),0) as investment_loss
  from public.financial_transactions group by 1 order by 1 desc limit 24
),
halves as (
  select extract(year from transaction_date)::int as yr,
    case when extract(month from transaction_date)<=6 then 1 else 2 end as half,
    coalesce(sum(case when transaction_type='contribution' and direction='in' then amount else 0 end),0) as contributions,
    coalesce(sum(case when transaction_type='expense' and direction='out' then amount else 0 end),0) as expenses,
    coalesce(sum(case when transaction_type in ('other_income','investment_profit') and direction='in' then amount else 0 end),0) as income,
    coalesce(sum(case when transaction_type='investment_loss' and direction='out' then amount else 0 end),0) as investment_loss
  from public.financial_transactions
  group by 1,2
  order by 1 desc,2 desc
  limit 12
)
select jsonb_build_object(
  'cash_balance',t.cash_balance,
  'bank_balance',t.bank_balance,
  'investment_balance',t.investment_balance,
  'total_assets',t.cash_balance+t.bank_balance+t.investment_balance,
  'total_contributions',t.total_contributions,
  'total_expenses',t.total_expenses,
  'other_income',t.other_income,
  'investment_profit',t.investment_profit,
  'investment_loss',t.investment_loss,
  'net_operating_result',t.other_income+t.investment_profit-t.total_expenses-t.investment_loss,
  'transaction_count',t.transaction_count,
  'last_updated',t.last_updated,
  'monthly_trend',coalesce((select jsonb_agg(jsonb_build_object(
    'month',to_char(m.month,'YYYY-MM'),'contributions',m.contributions,
    'expenses',m.expenses,'income',m.income,'investment_loss',m.investment_loss
  ) order by m.month) from months m),'[]'::jsonb),
  'half_yearly_trend',coalesce((select jsonb_agg(jsonb_build_object(
    'period',h.yr||'-H'||h.half,'year',h.yr,'half',h.half,
    'contributions',h.contributions,'expenses',h.expenses,
    'income',h.income,'investment_loss',h.investment_loss
  ) order by h.yr,h.half) from halves h),'[]'::jsonb)
)
from totals t;
$function$;


CREATE OR REPLACE FUNCTION private.issue_meeting_reminders()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  insert into public.notifications(user_id,notice_id,title,body,notification_type)
  select m.auth_user_id,n.id,n.title,
    'You have a notification from Friends Future Vision.','meeting_reminder'
  from public.notices n
  join public.members m on m.status='active' and m.auth_user_id is not null
  where n.published=true and n.notice_type='meeting'
    and n.meeting_at > now() and n.meeting_at <= now()+interval '5 minutes'
  on conflict do nothing;
$function$;


CREATE OR REPLACE FUNCTION private.issue_monthly_due_reminders()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  insert into public.notifications(user_id,title,body,notification_type)
  select m.auth_user_id,
    'Monthly contribution reminder',
    'You have a notification from Friends Future Vision.',
    'monthly_due'
  from public.members m
  where m.status='active'
    and m.auth_user_id is not null
    and m.monthly_contribution is not null
    and m.monthly_contribution > 0
    and m.contribution_start_date is not null
    and date_trunc('month',m.contribution_start_date) <= date_trunc('month',now())
    and not exists (
      select 1 from public.notifications n
      where n.user_id=m.auth_user_id and n.notification_type='monthly_due'
        and date_trunc('month',n.created_at)=date_trunc('month',now())
    );
$function$;


CREATE OR REPLACE FUNCTION private.notify_notice_recipients()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.published = true and (tg_op='INSERT' or old.published=false) then
    insert into public.notifications(user_id,notice_id,title,body,notification_type)
    select p.id,new.id,new.title,'You have a notification from Friends Future Vision.','general'
    from public.profiles p
    on conflict do nothing;
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.notify_payment_workflow()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare admin_row record;
begin
  if tg_op='INSERT' then
    for admin_row in select id from public.profiles where role='super_admin' loop
      insert into public.notifications(user_id,title,body,notification_type)
      values(admin_row.id,'New payment submission','A member submitted a payment for verification.','general');
    end loop;
  elsif old.status='pending' and new.status in ('approved','rejected') then
    insert into public.notifications(user_id,title,body,notification_type)
    values(new.submitted_by,
      case when new.status='approved' then 'Payment approved' else 'Payment rejected' end,
      case when new.status='approved' then 'Your payment was verified and added to the committee ledger.' else 'Your payment submission was rejected. Check the admin note for details.' end,
      'general');
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.notify_private_document_workflow()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare admin_row record;
begin
  if tg_op='INSERT' then
    for admin_row in select id from public.profiles where role='super_admin' loop
      insert into public.notifications(user_id,title,body,notification_type)
      values(admin_row.id,'New private ID document','A member uploaded a private ID document for review.','general');
    end loop;
  elsif old.status='pending' and new.status in ('approved','rejected') then
    insert into public.notifications(user_id,title,body,notification_type)
    values(new.owner_user_id,
      case when new.status='approved' then 'ID document approved' else 'ID document rejected' end,
      case when new.status='approved' then 'Your private ID document was approved.' else 'Your private ID document was rejected. Check the admin note.' end,
      'general');
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.notify_profile_workflow()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare admin_row record;
begin
  if tg_op='INSERT' then
    for admin_row in select id from public.profiles where role='super_admin' loop
      insert into public.notifications(user_id,title,body,notification_type)
      values(admin_row.id,'New profile change request','A member submitted a profile change request.','general');
    end loop;
  elsif old.status='pending' and new.status in ('approved','rejected') then
    insert into public.notifications(user_id,title,body,notification_type)
    values(new.submitted_by,
      case when new.status='approved' then 'Profile request approved' else 'Profile request rejected' end,
      case when new.status='approved' then 'Your profile change request was approved.' else 'Your profile change request was rejected. Check the admin note.' end,
      'general');
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.review_payment_submission(p_submission_id uuid, p_approved boolean, p_admin_note text DEFAULT NULL::text, p_account_type text DEFAULT 'cash'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.payment_submissions%rowtype;
begin
  if not (select private.is_super_admin()) then
    raise exception 'Super Admin permission required';
  end if;
  if p_approved is null then
    raise exception 'Approval decision is required';
  end if;
  if p_approved and (p_account_type is null or p_account_type not in ('cash','bank')) then
    raise exception 'Account type must be cash or bank';
  end if;
  select * into r from public.payment_submissions where id=p_submission_id for update;
  if not found then raise exception 'Payment submission not found'; end if;
  if r.status <> 'pending' then raise exception 'Payment submission already reviewed'; end if;
  if p_approved then
    if nullif(trim(r.reference_no),'') is null then
      raise exception 'Transaction ID is required';
    end if;
    insert into public.financial_transactions(
      member_id,transaction_type,amount,transaction_date,description,reference_no,
      created_by,account_type,direction
    ) values (
      r.member_id,'contribution',r.amount,r.payment_date,
      'Member payment approved (' || coalesce(r.payment_method,'payment') || ')',
      trim(r.reference_no),(select auth.uid()),p_account_type,'in'
    );
  end if;
  update public.payment_submissions
  set status = case when p_approved then 'approved' else 'rejected' end,
      admin_note = p_admin_note,
      reviewed_by = (select auth.uid()),
      reviewed_at = now()
  where id = p_submission_id;
end;
$function$;


CREATE OR REPLACE FUNCTION private.review_profile_change_request(p_request_id uuid, p_approved boolean, p_admin_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.profile_change_requests%rowtype;
begin
  if not (select private.is_super_admin()) then
    raise exception 'Super Admin permission required';
  end if;
  select * into r from public.profile_change_requests
    where id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'pending' then raise exception 'Request already reviewed'; end if;

  if p_approved then
    if r.requested_photo_path is not null
      and r.requested_photo_path not like (r.submitted_by::text || '/%') then
      raise exception 'Photo path does not belong to requester';
    end if;

    update public.members set
      full_name = case when r.requested_changes ? 'full_name' then r.requested_changes->>'full_name' else full_name end,
      full_name_bn = case when r.requested_changes ? 'full_name_bn' then r.requested_changes->>'full_name_bn' else full_name_bn end,
      phone = case when r.requested_changes ? 'phone' then r.requested_changes->>'phone' else phone end,
      email = case when r.requested_changes ? 'email' then r.requested_changes->>'email' else email end,
      alternate_phone = case when r.requested_changes ? 'alternate_phone' then r.requested_changes->>'alternate_phone' else alternate_phone end,
      whatsapp = case when r.requested_changes ? 'whatsapp' then r.requested_changes->>'whatsapp' else whatsapp end,
      profession = case when r.requested_changes ? 'profession' then r.requested_changes->>'profession' else profession end,
      present_address = case when r.requested_changes ? 'present_address' then r.requested_changes->>'present_address' else present_address end,
      permanent_address = case when r.requested_changes ? 'permanent_address' then r.requested_changes->>'permanent_address' else permanent_address end,
      father_name = case when r.requested_changes ? 'father_name' then r.requested_changes->>'father_name' else father_name end,
      mother_name = case when r.requested_changes ? 'mother_name' then r.requested_changes->>'mother_name' else mother_name end,
      spouse_name = case when r.requested_changes ? 'spouse_name' then r.requested_changes->>'spouse_name' else spouse_name end,
      gender = case when r.requested_changes ? 'gender' then r.requested_changes->>'gender' else gender end,
      date_of_birth = case when r.requested_changes ? 'date_of_birth' then (r.requested_changes->>'date_of_birth')::date else date_of_birth end,
      district = case when r.requested_changes ? 'district' then r.requested_changes->>'district' else district end,
      upazila = case when r.requested_changes ? 'upazila' then r.requested_changes->>'upazila' else upazila end,
      emergency_contact_name = case when r.requested_changes ? 'emergency_contact_name' then r.requested_changes->>'emergency_contact_name' else emergency_contact_name end,
      emergency_contact_relation = case when r.requested_changes ? 'emergency_contact_relation' then r.requested_changes->>'emergency_contact_relation' else emergency_contact_relation end,
      emergency_contact_phone = case when r.requested_changes ? 'emergency_contact_phone' then r.requested_changes->>'emergency_contact_phone' else emergency_contact_phone end,
      nominee_name = case when r.requested_changes ? 'nominee_name' then r.requested_changes->>'nominee_name' else nominee_name end,
      nominee_relation = case when r.requested_changes ? 'nominee_relation' then r.requested_changes->>'nominee_relation' else nominee_relation end,
      nominee_phone = case when r.requested_changes ? 'nominee_phone' then r.requested_changes->>'nominee_phone' else nominee_phone end,
      nominee_address = case when r.requested_changes ? 'nominee_address' then r.requested_changes->>'nominee_address' else nominee_address end,
      profile_photo_path = coalesce(r.requested_photo_path,profile_photo_path)
    where id=r.member_id;
  end if;

  update public.profile_change_requests set
    status=case when p_approved then 'approved' else 'rejected' end,
    admin_note=p_admin_note,
    reviewed_by=(select auth.uid()),
    reviewed_at=now()
  where id=p_request_id;
end;
$function$;


CREATE OR REPLACE FUNCTION private.set_current_committee_document(p_document_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.committee_documents%rowtype;
begin
  if not (select private.is_super_admin()) then
    raise exception 'Super Admin permission required';
  end if;
  select * into d from public.committee_documents where id=p_document_id for update;
  if not found then raise exception 'Document not found'; end if;
  update public.committee_documents set is_current=false where doc_type=d.doc_type and is_current=true;
  update public.committee_documents set is_current=true where id=p_document_id;
end;
$function$;


CREATE OR REPLACE FUNCTION private.set_member_contribution_rate(p_member_id uuid, p_amount numeric, p_effective_from date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_rate public.member_contribution_rates%rowtype;
  next_start date;
begin
  if not (select private.is_super_admin()) then raise exception 'Super Admin permission required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Monthly amount must be greater than zero'; end if;
  if p_effective_from is null or extract(day from p_effective_from) <> 1 then
    raise exception 'Effective date must be the first day of a month';
  end if;
  if not exists(select 1 from public.members where id=p_member_id and status='active') then
    raise exception 'Active member not found';
  end if;

  select * into current_rate
  from public.member_contribution_rates
  where member_id=p_member_id
    and effective_from <= p_effective_from
    and (effective_to is null or effective_to >= p_effective_from)
  order by effective_from desc
  limit 1
  for update;

  select min(effective_from) into next_start
  from public.member_contribution_rates
  where member_id=p_member_id and effective_from > p_effective_from;

  if found and current_rate.effective_from=p_effective_from then
    update public.member_contribution_rates
      set monthly_amount=p_amount
      where id=current_rate.id;
  else
    update public.member_contribution_rates
      set effective_to=p_effective_from-1
      where member_id=p_member_id
        and effective_from < p_effective_from
        and (effective_to is null or effective_to >= p_effective_from);
    insert into public.member_contribution_rates(member_id,monthly_amount,effective_from,effective_to,created_by)
    values(p_member_id,p_amount,p_effective_from,case when next_start is null then null else next_start-1 end,(select auth.uid()));
  end if;

  update public.members
  set monthly_contribution=p_amount,
      contribution_start_date=coalesce(contribution_start_date,p_effective_from)
  where id=p_member_id;
end;
$function$;


CREATE OR REPLACE FUNCTION private.sync_member_directory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'DELETE' then
    delete from public.member_directory where member_id = old.id;
    return old;
  end if;

  if new.status = 'active' then
    insert into public.member_directory
      (member_id, member_no, full_name, full_name_bn, profile_photo_path, status)
    values
      (new.id, new.member_no, new.full_name, new.full_name_bn, new.profile_photo_path, new.status)
    on conflict (member_id) do update set
      member_no = excluded.member_no,
      full_name = excluded.full_name,
      full_name_bn = excluded.full_name_bn,
      profile_photo_path = excluded.profile_photo_path,
      status = excluded.status;
  else
    delete from public.member_directory where member_id = new.id;
  end if;

  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.approve_member_signup(p_user_id uuid, p_admin_user_id uuid)
 RETURNS TABLE(member_id uuid, member_name text, member_email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_email text;
  v_role text;
  v_confirmed_at timestamptz;
  v_member public.members%rowtype;
  v_count integer;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_admin_user_id and role = 'super_admin'
  ) then
    raise exception 'Super Admin permission required';
  end if;

  select email, role into v_email, v_role
  from public.profiles where id = p_user_id for update;

  if not found or v_role not in ('pending','rejected') then
    raise exception 'Signup is not awaiting approval';
  end if;
  if v_email is null or btrim(v_email) = '' then
    raise exception 'Signup email is missing';
  end if;

  select email_confirmed_at into v_confirmed_at
  from auth.users where id = p_user_id;
  if not found or v_confirmed_at is null then
    raise exception 'Member must verify their email before approval';
  end if;

  select count(*) into v_count
  from public.members
  where lower(email) = lower(v_email)
    and status in ('pending','active')
    and (auth_user_id is null or auth_user_id = p_user_id);

  if v_count = 0 then
    raise exception 'No matching Google Form/member record found for this email';
  elsif v_count > 1 then
    raise exception 'Multiple member records use this email; resolve duplicates first';
  end if;

  select * into v_member
  from public.members
  where lower(email) = lower(v_email)
    and status in ('pending','active')
    and (auth_user_id is null or auth_user_id = p_user_id)
  for update;

  update public.members
  set status = 'active', auth_user_id = p_user_id
  where id = v_member.id;

  update public.profiles
  set role = 'member', full_name = v_member.full_name, email = lower(v_email)
  where id = p_user_id;

  return query select v_member.id, v_member.full_name, lower(v_email);
end;
$function$;


CREATE OR REPLACE FUNCTION public.assign_member_no_when_active()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'active' and nullif(btrim(new.member_no), '') is null then
    new.member_no := 'M-' || lpad(nextval('public.member_no_seq')::text, 3, '0');
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.get_financial_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT p.role INTO v_role
  FROM public.profiles AS p
  WHERE p.id = auth.uid();

  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'admin', 'member') THEN
    RAISE EXCEPTION 'Committee access required' USING ERRCODE = '42501';
  END IF;

  RETURN private.get_financial_summary();
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_push_config()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'vapid_public_key',(select decrypted_secret from vault.decrypted_secrets where name='ffvf_vapid_public_key' order by created_at desc limit 1),
    'vapid_private_key',(select decrypted_secret from vault.decrypted_secrets where name='ffvf_vapid_private_key' order by created_at desc limit 1),
    'vapid_subject',(select decrypted_secret from vault.decrypted_secrets where name='ffvf_vapid_subject' order by created_at desc limit 1),
    'cron_token',(select decrypted_secret from vault.decrypted_secrets where name='ffvf_cron_token' order by created_at desc limit 1)
  );
$function$;


CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (id, full_name, role, email, email_verified_at)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(coalesce(new.email,''),'@',1)),
    'pending',
    lower(new.email),
    new.email_confirmed_at
  )
  on conflict (id) do update
    set email = excluded.email,
        email_verified_at = excluded.email_verified_at;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.is_committee_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role in ('super_admin', 'admin')
    );
$function$;


CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role = 'super_admin'
    );
$function$;


CREATE OR REPLACE FUNCTION public.reject_member_signup(p_user_id uuid, p_admin_user_id uuid, p_reopen boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (
    select 1 from public.profiles
    where id = p_admin_user_id and role = 'super_admin'
  ) then
    raise exception 'Super Admin permission required';
  end if;

  update public.profiles
  set role = case when p_reopen then 'pending' else 'rejected' end
  where id = p_user_id and role in ('pending','rejected');

  if not found then
    raise exception 'Signup is not pending or rejected';
  end if;
end;
$function$;


CREATE OR REPLACE FUNCTION public.review_payment_submission(p_submission_id uuid, p_approved boolean, p_admin_note text DEFAULT NULL::text, p_account_type text DEFAULT 'cash'::text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.review_payment_submission(p_submission_id,p_approved,p_admin_note,p_account_type);
$function$;


CREATE OR REPLACE FUNCTION public.review_private_document(p_document_id uuid, p_approved boolean, p_admin_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.member_private_documents%rowtype;
begin
  if not (select private.is_super_admin()) then
    raise exception 'Super Admin permission required';
  end if;

  select * into d
  from public.member_private_documents
  where id = p_document_id
  for update;

  if not found then raise exception 'Document not found'; end if;
  if d.status <> 'pending' then raise exception 'Document already reviewed'; end if;

  if p_approved and d.document_type = 'nominee_photo' then
    if d.storage_path not like (d.owner_user_id::text || '/%') then
      raise exception 'Document path does not belong to owner';
    end if;
    update public.members
      set nominee_photo_path = d.storage_path
      where id = d.member_id;
  end if;

  update public.member_private_documents
    set status = case when p_approved then 'approved' else 'rejected' end,
        admin_note = p_admin_note,
        reviewed_by = (select auth.uid()),
        reviewed_at = now()
    where id = p_document_id;
end;
$function$;


CREATE OR REPLACE FUNCTION public.review_profile_change_request(p_request_id uuid, p_approved boolean, p_admin_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.review_profile_change_request(p_request_id,p_approved,p_admin_note); $function$;


CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;


CREATE OR REPLACE FUNCTION public.set_current_committee_document(p_document_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.set_current_committee_document(p_document_id);
$function$;


CREATE OR REPLACE FUNCTION public.set_member_contribution_rate(p_member_id uuid, p_amount numeric, p_effective_from date)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.set_member_contribution_rate(p_member_id,p_amount,p_effective_from); $function$;


CREATE OR REPLACE FUNCTION public.sync_auth_user_verification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.profiles
  set email = lower(new.email),
      email_verified_at = new.email_confirmed_at
  where id = new.id;
  return new;
end;
$function$;


ALTER TABLE public.committee_documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.committee_proofs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.financial_transaction_audit ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.member_contribution_rates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.member_directory ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.member_private_documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payment_submissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profile_change_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER on_auth_user_created_pending_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

CREATE TRIGGER on_auth_user_email_verification_updated AFTER UPDATE OF email_confirmed_at ON auth.users FOR EACH ROW WHEN (old.email_confirmed_at IS DISTINCT FROM new.email_confirmed_at) EXECUTE FUNCTION sync_auth_user_verification();

CREATE TRIGGER audit_financial_transaction_changes BEFORE DELETE OR UPDATE ON financial_transactions FOR EACH ROW EXECUTE FUNCTION private.audit_financial_transaction();

CREATE TRIGGER audit_financial_transaction_insert AFTER INSERT ON financial_transactions FOR EACH ROW EXECUTE FUNCTION private.audit_financial_transaction_insert();

CREATE TRIGGER private_document_notifications AFTER INSERT OR UPDATE OF status ON member_private_documents FOR EACH ROW EXECUTE FUNCTION private.notify_private_document_workflow();

CREATE TRIGGER sync_member_directory_after_member_change AFTER INSERT OR DELETE OR UPDATE OF member_no, full_name, full_name_bn, profile_photo_path, status ON members FOR EACH ROW EXECUTE FUNCTION private.sync_member_directory();

CREATE TRIGGER trg_assign_member_no_when_active BEFORE INSERT OR UPDATE OF status, member_no ON members FOR EACH ROW EXECUTE FUNCTION assign_member_no_when_active();

CREATE TRIGGER notices_notify_recipients AFTER INSERT OR UPDATE OF published ON notices FOR EACH ROW EXECUTE FUNCTION private.notify_notice_recipients();

CREATE TRIGGER payment_submission_notifications AFTER INSERT OR UPDATE OF status ON payment_submissions FOR EACH ROW EXECUTE FUNCTION private.notify_payment_workflow();

CREATE TRIGGER profile_change_notifications AFTER INSERT OR UPDATE OF status ON profile_change_requests FOR EACH ROW EXECUTE FUNCTION private.notify_profile_workflow();

CREATE POLICY "Committee documents: Super Admin manage" ON public.committee_documents AS permissive FOR ALL TO authenticated USING (( SELECT private.is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY "Committee documents: approved portal users read" ON public.committee_documents AS permissive FOR SELECT TO authenticated USING (( SELECT private.has_portal_access() AS has_portal_access));

CREATE POLICY "Committee proofs: Super Admin delete" ON public.committee_proofs AS permissive FOR DELETE TO authenticated USING (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY "Committee proofs: Super Admin insert" ON public.committee_proofs AS permissive FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY "Committee proofs: Super Admin update" ON public.committee_proofs AS permissive FOR UPDATE TO authenticated USING (( SELECT private.is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY "Committee proofs: approved portal users read" ON public.committee_proofs AS permissive FOR SELECT TO authenticated USING ((( SELECT private.has_portal_access() AS has_portal_access) AND ((published = true) OR ( SELECT private.is_super_admin() AS is_super_admin))));

CREATE POLICY "Transaction audit: Super Admin read" ON public.financial_transaction_audit AS permissive FOR SELECT TO authenticated USING (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY "Transactions: Super Admin or own read" ON public.financial_transactions AS permissive FOR SELECT TO authenticated USING ((( SELECT private.is_super_admin() AS is_super_admin) OR (EXISTS ( SELECT 1
   FROM members m
  WHERE ((m.id = financial_transactions.member_id) AND (m.auth_user_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY "Contribution rates: Super Admin delete" ON public.member_contribution_rates AS permissive FOR DELETE TO authenticated USING (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY "Contribution rates: Super Admin insert" ON public.member_contribution_rates AS permissive FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY "Contribution rates: Super Admin update" ON public.member_contribution_rates AS permissive FOR UPDATE TO authenticated USING (( SELECT private.is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY "Contribution rates: own or Super Admin read" ON public.member_contribution_rates AS permissive FOR SELECT TO authenticated USING ((( SELECT private.is_super_admin() AS is_super_admin) OR (EXISTS ( SELECT 1
   FROM members m
  WHERE ((m.id = member_contribution_rates.member_id) AND (m.auth_user_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY "Directory: approved portal users read" ON public.member_directory AS permissive FOR SELECT TO authenticated USING (( SELECT private.has_portal_access() AS has_portal_access));

CREATE POLICY "Private documents: Super Admin delete" ON public.member_private_documents AS permissive FOR DELETE TO authenticated USING (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY "Private documents: Super Admin update" ON public.member_private_documents AS permissive FOR UPDATE TO authenticated USING (( SELECT private.is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY "Private documents: owner or Super Admin read" ON public.member_private_documents AS permissive FOR SELECT TO authenticated USING (((owner_user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_super_admin() AS is_super_admin)));

CREATE POLICY "Private documents: owner pending insert" ON public.member_private_documents AS permissive FOR INSERT TO authenticated WITH CHECK (((owner_user_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (storage_path ~~ ((( SELECT auth.uid() AS uid))::text || '/%'::text)) AND (EXISTS ( SELECT 1
   FROM members m
  WHERE ((m.id = member_private_documents.member_id) AND (m.auth_user_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY "Members: Super Admin delete" ON public.members AS permissive FOR DELETE TO authenticated USING (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY "Members: Super Admin insert" ON public.members AS permissive FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY "Members: Super Admin or own read" ON public.members AS permissive FOR SELECT TO authenticated USING ((( SELECT private.is_super_admin() AS is_super_admin) OR (auth_user_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY "Members: Super Admin update" ON public.members AS permissive FOR UPDATE TO authenticated USING (( SELECT private.is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY "Notices: Super Admin delete" ON public.notices AS permissive FOR DELETE TO authenticated USING (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY "Notices: Super Admin insert" ON public.notices AS permissive FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY "Notices: Super Admin update" ON public.notices AS permissive FOR UPDATE TO authenticated USING (( SELECT private.is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY "Notices: approved portal users read" ON public.notices AS permissive FOR SELECT TO authenticated USING ((( SELECT private.has_portal_access() AS has_portal_access) AND ((published = true) OR ( SELECT private.is_super_admin() AS is_super_admin))));

CREATE POLICY notifications_read_own ON public.notifications AS permissive FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY notifications_update_own ON public.notifications AS permissive FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Payment methods: Super Admin manage" ON public.payment_methods AS permissive FOR ALL TO authenticated USING (( SELECT private.is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY "Payment methods: approved portal users read active" ON public.payment_methods AS permissive FOR SELECT TO authenticated USING ((( SELECT private.has_portal_access() AS has_portal_access) AND ((active = true) OR ( SELECT private.is_super_admin() AS is_super_admin))));

CREATE POLICY "Payments: Super Admin full access" ON public.payment_submissions AS permissive FOR ALL TO authenticated USING (( SELECT private.is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY "Payments: members read own" ON public.payment_submissions AS permissive FOR SELECT TO authenticated USING (((submitted_by = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_super_admin() AS is_super_admin)));

CREATE POLICY "Payments: members submit own pending" ON public.payment_submissions AS permissive FOR INSERT TO authenticated WITH CHECK (((submitted_by = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (amount > (0)::numeric) AND (payment_date <= ((now() AT TIME ZONE 'Asia/Dhaka'::text))::date) AND (payment_method = ANY (ARRAY['bkash'::text, 'nagad'::text])) AND ((char_length(TRIM(BOTH FROM reference_no)) >= 1) AND (char_length(TRIM(BOTH FROM reference_no)) <= 100)) AND (EXISTS ( SELECT 1
   FROM members m
  WHERE ((m.id = payment_submissions.member_id) AND (m.auth_user_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text))))));

CREATE POLICY "Profile requests: Super Admin delete" ON public.profile_change_requests AS permissive FOR DELETE TO authenticated USING (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY "Profile requests: Super Admin or own read" ON public.profile_change_requests AS permissive FOR SELECT TO authenticated USING ((( SELECT private.is_super_admin() AS is_super_admin) OR (submitted_by = ( SELECT auth.uid() AS uid))));

CREATE POLICY "Profile requests: Super Admin update" ON public.profile_change_requests AS permissive FOR UPDATE TO authenticated USING (( SELECT private.is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY "Profile requests: member pending or Super Admin insert" ON public.profile_change_requests AS permissive FOR INSERT TO authenticated WITH CHECK ((( SELECT private.is_super_admin() AS is_super_admin) OR ((submitted_by = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND ((requested_photo_path IS NULL) OR (requested_photo_path ~~ ((( SELECT auth.uid() AS uid))::text || '/%'::text))) AND (EXISTS ( SELECT 1
   FROM members m
  WHERE ((m.id = profile_change_requests.member_id) AND (m.auth_user_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "Profiles: Super Admin delete" ON public.profiles AS permissive FOR DELETE TO authenticated USING (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY "Profiles: Super Admin insert" ON public.profiles AS permissive FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY "Profiles: Super Admin or own read" ON public.profiles AS permissive FOR SELECT TO authenticated USING (((id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_super_admin() AS is_super_admin)));

CREATE POLICY "Profiles: Super Admin update" ON public.profiles AS permissive FOR UPDATE TO authenticated USING (( SELECT private.is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT private.is_super_admin() AS is_super_admin));

CREATE POLICY push_subscriptions_delete_own ON public.push_subscriptions AS permissive FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY push_subscriptions_insert_own ON public.push_subscriptions AS permissive FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY push_subscriptions_select_own ON public.push_subscriptions AS permissive FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY push_subscriptions_update_own ON public.push_subscriptions AS permissive FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Committee documents storage: Super Admin delete" ON storage.objects AS permissive FOR DELETE TO authenticated USING (((bucket_id = 'committee-documents'::text) AND ( SELECT private.is_super_admin() AS is_super_admin)));

CREATE POLICY "Committee documents storage: Super Admin insert" ON storage.objects AS permissive FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'committee-documents'::text) AND ( SELECT private.is_super_admin() AS is_super_admin)));

CREATE POLICY "Committee documents storage: Super Admin update" ON storage.objects AS permissive FOR UPDATE TO authenticated USING (((bucket_id = 'committee-documents'::text) AND ( SELECT private.is_super_admin() AS is_super_admin))) WITH CHECK (((bucket_id = 'committee-documents'::text) AND ( SELECT private.is_super_admin() AS is_super_admin)));

CREATE POLICY "Committee documents storage: approved portal read" ON storage.objects AS permissive FOR SELECT TO authenticated USING (((bucket_id = 'committee-documents'::text) AND ( SELECT private.has_portal_access() AS has_portal_access)));

CREATE POLICY "Committee proofs: Super Admin full access" ON storage.objects AS permissive FOR ALL TO authenticated USING (((bucket_id = 'committee-proofs'::text) AND ( SELECT private.is_super_admin() AS is_super_admin))) WITH CHECK (((bucket_id = 'committee-proofs'::text) AND ( SELECT private.is_super_admin() AS is_super_admin)));

CREATE POLICY "Committee proofs: approved portal read published files" ON storage.objects AS permissive FOR SELECT TO authenticated USING (((bucket_id = 'committee-proofs'::text) AND ( SELECT private.has_portal_access() AS has_portal_access) AND (EXISTS ( SELECT 1
   FROM committee_proofs p
  WHERE ((p.storage_path = objects.name) AND (p.published = true))))));

CREATE POLICY "Member photos: Super Admin full access" ON storage.objects AS permissive FOR ALL TO authenticated USING (((bucket_id = 'member-profile-photos'::text) AND ( SELECT private.is_super_admin() AS is_super_admin))) WITH CHECK (((bucket_id = 'member-profile-photos'::text) AND ( SELECT private.is_super_admin() AS is_super_admin)));

CREATE POLICY "Member photos: approved portal read" ON storage.objects AS permissive FOR SELECT TO authenticated USING (((bucket_id = 'member-profile-photos'::text) AND ( SELECT private.has_portal_access() AS has_portal_access) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR ( SELECT private.is_super_admin() AS is_super_admin) OR (EXISTS ( SELECT 1
   FROM member_directory d
  WHERE (d.profile_photo_path = objects.name))))));

CREATE POLICY "Member photos: approved portal upload own folder" ON storage.objects AS permissive FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'member-profile-photos'::text) AND ( SELECT private.has_portal_access() AS has_portal_access) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY "Payment QR: Super Admin delete" ON storage.objects AS permissive FOR DELETE TO authenticated USING (((bucket_id = 'payment-qr'::text) AND ( SELECT private.is_super_admin() AS is_super_admin)));

CREATE POLICY "Payment QR: Super Admin insert" ON storage.objects AS permissive FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'payment-qr'::text) AND ( SELECT private.is_super_admin() AS is_super_admin)));

CREATE POLICY "Payment QR: Super Admin update" ON storage.objects AS permissive FOR UPDATE TO authenticated USING (((bucket_id = 'payment-qr'::text) AND ( SELECT private.is_super_admin() AS is_super_admin))) WITH CHECK (((bucket_id = 'payment-qr'::text) AND ( SELECT private.is_super_admin() AS is_super_admin)));

CREATE POLICY "Payment QR: approved portal read" ON storage.objects AS permissive FOR SELECT TO authenticated USING (((bucket_id = 'payment-qr'::text) AND ( SELECT private.has_portal_access() AS has_portal_access)));

CREATE POLICY "Private member docs: Super Admin delete" ON storage.objects AS permissive FOR DELETE TO authenticated USING (((bucket_id = 'member-private-documents'::text) AND ( SELECT private.is_super_admin() AS is_super_admin)));

CREATE POLICY "Private member docs: Super Admin update" ON storage.objects AS permissive FOR UPDATE TO authenticated USING (((bucket_id = 'member-private-documents'::text) AND ( SELECT private.is_super_admin() AS is_super_admin))) WITH CHECK (((bucket_id = 'member-private-documents'::text) AND ( SELECT private.is_super_admin() AS is_super_admin)));

CREATE POLICY "Private member docs: approved portal owner upload" ON storage.objects AS permissive FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'member-private-documents'::text) AND ( SELECT private.has_portal_access() AS has_portal_access) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY "Private member docs: owner or Super Admin read" ON storage.objects AS permissive FOR SELECT TO authenticated USING (((bucket_id = 'member-private-documents'::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR ( SELECT private.is_super_admin() AS is_super_admin))));

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('committee-documents','committee-documents','f',10485760,ARRAY['image/jpeg','image/png','image/webp','application/pdf']::text[]) ON CONFLICT (id) DO UPDATE SET name=excluded.name,public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('committee-proofs','committee-proofs','f',10485760,ARRAY['image/jpeg','image/png','image/webp','application/pdf']::text[]) ON CONFLICT (id) DO UPDATE SET name=excluded.name,public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('member-private-documents','member-private-documents','f',10485760,ARRAY['image/jpeg','image/png','image/webp','application/pdf']::text[]) ON CONFLICT (id) DO UPDATE SET name=excluded.name,public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('member-profile-photos','member-profile-photos','f',5242880,ARRAY['image/jpeg','image/png','image/webp']::text[]) ON CONFLICT (id) DO UPDATE SET name=excluded.name,public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('payment-qr','payment-qr','f',2097152,ARRAY['image/jpeg','image/png','image/webp']::text[]) ON CONFLICT (id) DO UPDATE SET name=excluded.name,public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

GRANT USAGE ON SCHEMA private TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.members, public.payment_submissions, public.profile_change_requests, public.committee_proofs, public.notices, public.payment_methods, public.member_private_documents, public.committee_documents, public.member_contribution_rates, public.push_subscriptions TO authenticated;

GRANT SELECT ON public.financial_transactions, public.financial_transaction_audit, public.member_directory TO authenticated;

GRANT SELECT, UPDATE ON public.notifications TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.has_portal_access() TO authenticated;

GRANT EXECUTE ON FUNCTION private.is_super_admin() TO authenticated;

GRANT EXECUTE ON FUNCTION private.review_profile_change_request(uuid,boolean,text) TO authenticated;

GRANT EXECUTE ON FUNCTION private.set_member_contribution_rate(uuid,numeric,date) TO authenticated;

GRANT EXECUTE ON FUNCTION private.get_financial_summary() TO service_role;

GRANT EXECUTE ON FUNCTION public.get_financial_summary() TO authenticated;

GRANT EXECUTE ON FUNCTION public.review_payment_submission(uuid,boolean,text,text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.review_private_document(uuid,boolean,text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.review_profile_change_request(uuid,boolean,text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_current_committee_document(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_member_contribution_rate(uuid,numeric,date) TO authenticated;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO service_role;