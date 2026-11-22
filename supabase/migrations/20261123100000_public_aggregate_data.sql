-- Anonymous visitors receive committee-level financial aggregates only.
-- The member-level matrix remains protected behind authenticated member/super-admin access.
do $$
declare
  v_definition text;
  v_auth_guard text := $guard$
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.role IN ('member', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Committee access required' USING ERRCODE = '42501';
  END IF;
$guard$;
begin
  v_definition := pg_get_functiondef('private.get_financial_summary_unchecked()'::regprocedure);
  v_definition := replace(v_definition,
    'FUNCTION private.get_financial_summary_unchecked()',
    'FUNCTION private.get_public_financial_summary_unchecked()');
  if position(v_auth_guard in v_definition) = 0 then
    raise exception 'Expected auth guard was not found; aborting migration';
  end if;
  v_definition := replace(v_definition, v_auth_guard, '');
  execute v_definition;
end;
$$;

revoke all on function private.get_public_financial_summary_unchecked() from public, anon, authenticated;

create or replace function public.get_public_financial_summary()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'cash_balance', s->'cash_balance',
    'bank_balance', s->'bank_balance',
    'investment_balance', s->'investment_balance',
    'total_assets', s->'total_assets',
    'total_contributions', s->'total_contributions',
    'total_expenses', s->'total_expenses',
    'other_income', s->'other_income',
    'investment_profit', s->'investment_profit',
    'investment_loss', s->'investment_loss',
    'net_operating_result', s->'net_operating_result',
    'transaction_count', s->'transaction_count',
    'last_updated', s->'last_updated',
    'monthly_trend', s->'monthly_trend',
    'half_yearly_trend', s->'half_yearly_trend'
  )
  from (select private.get_public_financial_summary_unchecked() as s) summary;
$function$;

revoke all on function public.get_public_financial_summary() from public;
grant execute on function public.get_public_financial_summary() to anon, authenticated;
