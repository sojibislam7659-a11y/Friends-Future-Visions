-- Keep all dashboard account balances within the committee's Jan 2027–Dec 2031 accounting period.
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
          AND split_part(coalesce(t.reference_no,''),'|',2) ~ '^[0-9]{4}-[0-9]{2}$'
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
$function$

