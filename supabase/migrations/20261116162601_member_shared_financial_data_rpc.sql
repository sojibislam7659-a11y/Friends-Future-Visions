create or replace function public.get_member_shared_financial_data()
returns table (
 member_id uuid, member_no text, full_name text, full_name_bn text,
 contribution_month date, amount numeric, paid_day integer, last_paid_at timestamptz,
 total_paid numeric, total_due numeric, due_configured boolean
)
language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('member','super_admin')) then
  raise exception 'Member access required' using errcode='42501';
 end if;
 return query
 with active_members as (
  select m.id,m.member_no::text,m.full_name::text,m.full_name_bn::text
  from public.members m where m.status='active'
 ), month_grid as (
  select am.*,gs.month_start::date as month_start from active_members am
  cross join generate_series(date '2026-12-01',date '2031-11-01',interval '1 month') gs(month_start)
 ), contributions as (
  select t.member_id,date_trunc('month',t.transaction_date)::date as month_start,
   sum(t.amount)::numeric as amount,max(t.transaction_date)::date as paid_date,
   max(coalesce(t.updated_at,t.created_at)) as last_paid_at
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
   and (cr.effective_to is null or cr.effective_to >= g.month_start)
   and g.month_start <= current_date
  group by cr.member_id
 ), paid as (
  select t.member_id,sum(t.amount)::numeric as total_paid
  from public.financial_transactions t
  where t.transaction_type='contribution' and t.direction='in'
   and t.transaction_date>=date '2026-12-01' and t.transaction_date<=current_date
   and not exists(select 1 from public.financial_transactions r where r.reversal_of_id=t.id)
  group by t.member_id
 ), configured as (
  select cr.member_id from public.member_contribution_rates cr group by cr.member_id
 )
 select mg.id,mg.member_no,mg.full_name,mg.full_name_bn,mg.month_start,
  coalesce(c.amount,0)::numeric,extract(day from c.paid_date)::integer,c.last_paid_at,
  coalesce(p.total_paid,0)::numeric,
  greatest(0,coalesce(e.expected,0)-coalesce(p.total_paid,0))::numeric,
  (cfg.member_id is not null)
 from month_grid mg
 left join contributions c on c.member_id=mg.id and c.month_start=mg.month_start
 left join expected e on e.member_id=mg.id
 left join paid p on p.member_id=mg.id
 left join configured cfg on cfg.member_id=mg.id
 order by mg.member_no,mg.month_start;
end;
$$;
revoke all on function public.get_member_shared_financial_data() from public;
grant execute on function public.get_member_shared_financial_data() to authenticated;