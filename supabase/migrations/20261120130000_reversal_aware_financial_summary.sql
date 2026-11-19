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
    coalesce(sum(case when t.transaction_type='contribution' and t.direction='in' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) as total_contributions,
    coalesce(sum(case when t.transaction_type='expense' and t.direction='out' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) as total_expenses,
    coalesce(sum(case when t.transaction_type='other_income' and t.direction='in' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) as other_income,
    coalesce(sum(case when t.transaction_type='investment_profit' and t.direction='in' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) as investment_profit,
    coalesce(sum(case when t.transaction_type='investment_loss' and t.direction='out' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) as investment_loss,
    count(*) as transaction_count,
    max(created_at) as last_updated
  from public.financial_transactions t
),
months as (
  select date_trunc('month',transaction_date)::date as month,
    coalesce(sum(case when t.transaction_type='contribution' and t.direction='in' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) as contributions,
    coalesce(sum(case when t.transaction_type='expense' and t.direction='out' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) as expenses,
    coalesce(sum(case when t.transaction_type in ('other_income','investment_profit') and t.direction='in' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) as income,
    coalesce(sum(case when t.transaction_type='investment_loss' and t.direction='out' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) as investment_loss
  from public.financial_transactions t group by 1 order by 1 desc limit 24
),
halves as (
  select extract(year from transaction_date)::int as yr,
    case when extract(month from transaction_date)<=6 then 1 else 2 end as half,
    coalesce(sum(case when t.transaction_type='contribution' and t.direction='in' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) as contributions,
    coalesce(sum(case when t.transaction_type='expense' and t.direction='out' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) as expenses,
    coalesce(sum(case when t.transaction_type in ('other_income','investment_profit') and t.direction='in' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) as income,
    coalesce(sum(case when t.transaction_type='investment_loss' and t.direction='out' and not exists (select 1 from public.financial_transactions r where r.reversal_of_id=t.id) then t.amount else 0 end),0) as investment_loss
  from public.financial_transactions t
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
$function$


CREATE INDEX IF NOT EXISTS financial_transactions_reversal_of_id_idx ON public.financial_transactions(reversal_of_id) WHERE reversal_of_id IS NOT NULL;