-- Production-parity security hardening.
-- This migration is intentionally staged only; do not apply before the verified
-- production backup/restore gate in docs/PRODUCTION-MIGRATION-PLAN.md.
-- All privileged operations remain behind private SECURITY DEFINER helpers
-- that enforce the authenticated caller's role internally.

begin;

do $preflight$
begin
  if to_regprocedure('private.get_financial_summary()') is null then
    raise exception 'Preflight failed: private.get_financial_summary() is missing';
  end if;
  if to_regprocedure('private.review_payment_submission(uuid,boolean,text,text)') is null then
    raise exception 'Preflight failed: private.review_payment_submission(uuid,boolean,text,text) is missing';
  end if;
  if to_regprocedure('private.set_current_committee_document(uuid)') is null then
    raise exception 'Preflight failed: private.set_current_committee_document(uuid) is missing';
  end if;
  if to_regprocedure('private.is_super_admin()') is null then
    raise exception 'Preflight failed: private.is_super_admin() is missing';
  end if;
  if to_regclass('public.profiles') is null
     or to_regclass('public.member_private_documents') is null
     or to_regclass('public.members') is null then
    raise exception 'Preflight failed: required public tables are missing';
  end if;
end;
$preflight$;

-- The summary helper is SECURITY DEFINER so it can aggregate the complete
-- committee ledger. Enforce the application role here, not only in its wrapper.
create or replace function private.get_financial_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_role text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select p.role into v_role
  from public.profiles as p
  where p.id = (select auth.uid());

  if v_role is null or v_role not in ('super_admin', 'member') then
    raise exception 'Committee access required' using errcode = '42501';
  end if;

  return (
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
    from totals t
  );
end;
$function$;

-- Move the private-document mutation body behind a private, role-checking helper.
create or replace function private.review_private_document(
  p_document_id uuid,
  p_approved boolean,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  d public.member_private_documents%rowtype;
begin
  if not (select private.is_super_admin()) then
    raise exception 'Super Admin permission required' using errcode = '42501';
  end if;
  if p_approved is null then
    raise exception 'Approval decision is required';
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

-- Private helpers independently authorize callers. Public RPC wrappers run as
-- INVOKER, so the exposed functions no longer inherit owner privileges.
revoke all on function private.get_financial_summary() from public, anon;
revoke all on function private.review_payment_submission(uuid,boolean,text,text) from public, anon;
revoke all on function private.set_current_committee_document(uuid) from public, anon;
revoke all on function private.review_private_document(uuid,boolean,text) from public, anon;

grant execute on function private.get_financial_summary() to authenticated, service_role;
grant execute on function private.review_payment_submission(uuid,boolean,text,text) to authenticated, service_role;
grant execute on function private.set_current_committee_document(uuid) to authenticated, service_role;
grant execute on function private.review_private_document(uuid,boolean,text) to authenticated, service_role;

create or replace function public.get_financial_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.get_financial_summary();
$function$;

create or replace function public.review_payment_submission(
  p_submission_id uuid,
  p_approved boolean,
  p_admin_note text default null,
  p_account_type text default 'cash'
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.review_payment_submission(p_submission_id,p_approved,p_admin_note,p_account_type);
$function$;

create or replace function public.set_current_committee_document(p_document_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.set_current_committee_document(p_document_id);
$function$;

create or replace function public.review_private_document(
  p_document_id uuid,
  p_approved boolean,
  p_admin_note text default null
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.review_private_document(p_document_id,p_approved,p_admin_note);
$function$;

revoke all on function public.get_financial_summary() from public, anon;
revoke all on function public.review_payment_submission(uuid,boolean,text,text) from public, anon;
revoke all on function public.set_current_committee_document(uuid) from public, anon;
revoke all on function public.review_private_document(uuid,boolean,text) from public, anon;

grant execute on function public.get_financial_summary() to authenticated, service_role;
grant execute on function public.review_payment_submission(uuid,boolean,text,text) to authenticated, service_role;
grant execute on function public.set_current_committee_document(uuid) to authenticated, service_role;
grant execute on function public.review_private_document(uuid,boolean,text) to authenticated, service_role;

commit;
