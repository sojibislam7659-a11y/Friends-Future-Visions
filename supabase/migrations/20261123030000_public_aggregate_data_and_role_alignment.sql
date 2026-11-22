-- Public Data page: expose aggregate committee figures only, never member-level data.
-- Keep member-level contribution matrix behind authenticated RLS.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
grant select on public.committee_rules to anon;

create or replace function private.has_portal_access()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('super_admin','member')
  );
$function$;

create or replace function public.get_financial_summary()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select p.role into v_role
  from public.profiles as p
  where p.id = auth.uid();

  if v_role is null or v_role not in ('super_admin','member') then
    raise exception 'Committee access required' using errcode = '42501';
  end if;

  return private.get_financial_summary();
end;
$function$;

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
  from (select private.get_financial_summary() as s) summary;
$function$;

revoke all on function public.get_public_financial_summary() from public;
grant execute on function public.get_public_financial_summary() to anon, authenticated;
