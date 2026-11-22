-- Read-only verification for the Production immutable ledger migration.
-- Run only against an isolated Production restore rehearsal after applying
-- 20261122123000_add_production_immutable_financial_ledger.sql.

do $verify$
declare
  v_count integer;
  v_rls boolean;
  v_definer boolean;
  v_def text;
begin
  if to_regclass('public.financial_postings') is null then
    raise exception 'financial_postings table is missing';
  end if;

  select relrowsecurity into v_rls
  from pg_class where oid='public.financial_postings'::regclass;
  if not v_rls then raise exception 'financial_postings RLS is disabled'; end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='financial_transactions'
      and column_name='posting_id' and is_nullable<>'NO'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='financial_transactions'
      and column_name='reversal_of_id'
  ) then
    raise exception 'Ledger posting/reversal columns are missing or nullable';
  end if;

  if exists (
    select 1 from public.financial_transactions t
    left join public.financial_postings p on p.id=t.posting_id
    where p.id is null
  ) then
    raise exception 'A transaction has no matching posting';
  end if;

  if exists (
    select 1
    from public.financial_postings p
    left join public.financial_transactions t on t.posting_id=p.id
    group by p.id,p.posting_type
    having count(t.id)=0
       or (p.posting_type='transfer' and count(t.id)<>2)
       or (p.posting_type='standard' and count(t.id)<>1)
       or (p.posting_type='reversal' and count(t.id) not in (1,2))
  ) then
    raise exception 'Posting-to-transaction cardinality is invalid';
  end if;

  if exists (
    select 1 from public.financial_transactions
    where transaction_type='transfer' and transfer_group_id is null
  ) or exists (
    select 1 from public.financial_transactions
    where transaction_type='reversal' and reversal_of_id is null
  ) then
    raise exception 'Transfer or reversal references are missing';
  end if;

  if exists (
    select 1 from public.financial_transactions
    where reversal_of_id is not null
    group by reversal_of_id having count(*)>1
  ) then
    raise exception 'An original transaction has more than one reversal';
  end if;

  if exists (
    select 1 from public.financial_transactions t
    join public.financial_transactions original on original.id=t.reversal_of_id
    join public.financial_postings reversal_posting on reversal_posting.id=t.posting_id
    where reversal_posting.posting_type<>'reversal'
       or reversal_posting.reversal_of_posting_id<>original.posting_id
       or t.amount<>original.amount
       or t.account_type<>original.account_type
       or t.direction=original.direction
  ) then
    raise exception 'A reversal row does not match its original posting entry';
  end if;

  if exists (
    select transfer_group_id
    from public.financial_transactions
    where transaction_type='transfer'
    group by transfer_group_id
    having count(*)<>2
       or count(*) filter(where direction='out')<>1
       or count(*) filter(where direction='in')<>1
       or count(distinct amount)<>1
       or count(distinct account_type)<>2
       or count(distinct posting_id)<>1
  ) then
    raise exception 'A transfer group is not balanced';
  end if;

  if has_table_privilege('authenticated','public.financial_transactions','INSERT')
     or has_table_privilege('authenticated','public.financial_transactions','UPDATE')
     or has_table_privilege('authenticated','public.financial_transactions','DELETE')
     or has_table_privilege('anon','public.financial_transactions','SELECT')
     or has_table_privilege('anon','public.financial_transactions','INSERT') then
    raise exception 'Direct browser/anonymous financial transaction privileges remain';
  end if;

  if has_table_privilege('authenticated','public.financial_postings','INSERT')
     or has_table_privilege('authenticated','public.financial_postings','UPDATE')
     or has_table_privilege('authenticated','public.financial_postings','DELETE')
     or has_table_privilege('anon','public.financial_postings','SELECT') then
    raise exception 'Direct browser/anonymous posting privileges remain';
  end if;

  if has_table_privilege('authenticated','public.financial_transaction_audit','INSERT')
     or has_table_privilege('authenticated','public.financial_transaction_audit','UPDATE')
     or has_table_privilege('authenticated','public.financial_transaction_audit','DELETE')
     or has_table_privilege('anon','public.financial_transaction_audit','SELECT') then
    raise exception 'Direct browser/anonymous financial audit mutation/read privileges remain';
  end if;

  if not has_function_privilege('authenticated','public.post_financial_transaction(uuid,text,numeric,date,text,text,uuid,text,text,text,text,text)','EXECUTE')
     or has_function_privilege('anon','public.post_financial_transaction(uuid,text,numeric,date,text,text,uuid,text,text,text,text,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.reverse_financial_posting(uuid,uuid,text)','EXECUTE')
     or has_function_privilege('anon','public.reverse_financial_posting(uuid,uuid,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.correct_financial_transactions(uuid,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.correct_financial_transactions(uuid,jsonb)','EXECUTE') then
    raise exception 'Ledger RPC grants are unexpected';
  end if;

  if has_function_privilege('authenticated','public.save_financial_transaction_edits(jsonb)','EXECUTE')
     or has_function_privilege('anon','public.save_financial_transaction_edits(jsonb)','EXECUTE') then
    raise exception 'Legacy direct-edit RPC remains executable';
  end if;

  select prosecdef into v_definer
  from pg_proc where oid='public.get_financial_summary()'::regprocedure;
  if v_definer then raise exception 'Public financial summary wrapper must be SECURITY INVOKER'; end if;

  select prosecdef into v_definer
  from pg_proc where oid='private.get_financial_summary()'::regprocedure;
  if not v_definer then raise exception 'Private financial summary helper must be SECURITY DEFINER'; end if;

  if not has_function_privilege('authenticated','public.get_member_shared_financial_data_v2()','EXECUTE')
     or has_function_privilege('anon','public.get_member_shared_financial_data_v2()','EXECUTE') then
    raise exception 'Shared financial data v2 RPC grants are unexpected';
  end if;

  if not has_function_privilege('authenticated','public.save_contribution_matrix(uuid,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.save_contribution_matrix(uuid,jsonb)','EXECUTE')
     or not has_function_privilege('authenticated','private.save_contribution_matrix(uuid,jsonb)','EXECUTE')
     or has_function_privilege('anon','private.save_contribution_matrix(uuid,jsonb)','EXECUTE')
     or has_function_privilege('service_role','private.save_contribution_matrix(uuid,jsonb)','EXECUTE') then
    raise exception 'Contribution Matrix save RPC grants are unexpected';
  end if;

  select prosecdef into v_definer
  from pg_proc where oid='public.save_contribution_matrix(uuid,jsonb)'::regprocedure;
  if v_definer then raise exception 'Public contribution matrix wrapper must be SECURITY INVOKER'; end if;

  select prosecdef into v_definer
  from pg_proc where oid='private.save_contribution_matrix(uuid,jsonb)'::regprocedure;
  if not v_definer then raise exception 'Private contribution matrix helper must be SECURITY DEFINER'; end if;

  select prosecdef into v_definer
  from pg_proc where oid='public.get_member_shared_financial_data_v2()'::regprocedure;
  if v_definer then raise exception 'Public shared financial data wrapper must be SECURITY INVOKER'; end if;

  select pg_get_functiondef('private.get_member_shared_financial_data_v2()'::regprocedure) into v_def;
  if position('coalesce(rate.monthly_amount,2000)' in lower(v_def))=0 then
    raise exception 'Shared due calculation must default missing member rate to 2000';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.financial_transactions'::regclass
      and tgname='prevent_financial_transaction_mutation'
      and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid='public.financial_postings'::regclass
      and tgname='prevent_financial_posting_mutation'
      and not tgisinternal
  ) then
    raise exception 'Immutable ledger triggers are missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.financial_transaction_audit'::regclass
      and conname='financial_transaction_audit_action_check'
      and position('INSERT' in pg_get_constraintdef(oid))>0
  ) then
    raise exception 'Financial audit INSERT action is not allowed';
  end if;
end;
$verify$;

select
  (select count(*) from public.financial_postings) as posting_count,
  (select count(*) from public.financial_transactions) as transaction_count,
  'ledger links, reversals, transfers, grants and immutability verified' as verification_result;
