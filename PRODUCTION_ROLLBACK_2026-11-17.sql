-- Production rollback for the 2026-11-17 release additions.
-- Run only after rolling the frontend back to the pre-change Main commit.
-- IMPORTANT: This removes the new editor functions and the rules content table.
-- It deliberately does NOT delete financial_transactions, contribution rates,
-- payment submissions, proof files, notice rows, or member/profile data.

-- Restore the pre-release definition of the existing contribution-rate helper.
CREATE OR REPLACE FUNCTION private.set_member_contribution_rate(p_member_id uuid, p_amount numeric, p_effective_from date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  current_rate public.member_contribution_rates%rowtype;
  next_start date;
BEGIN
  IF NOT (SELECT private.is_super_admin()) THEN RAISE EXCEPTION 'Super Admin permission required'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Monthly amount must be greater than zero'; END IF;
  IF p_effective_from IS NULL OR extract(day FROM p_effective_from) <> 1 THEN
    RAISE EXCEPTION 'Effective date must be the first day of a month';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.members WHERE id=p_member_id AND status='active') THEN
    RAISE EXCEPTION 'Active member not found';
  END IF;

  SELECT * INTO current_rate
  FROM public.member_contribution_rates
  WHERE member_id=p_member_id
    AND effective_from<=p_effective_from
    AND (effective_to IS NULL OR effective_to>=p_effective_from)
  ORDER BY effective_from DESC
  LIMIT 1
  FOR UPDATE;

  SELECT min(effective_from) INTO next_start
  FROM public.member_contribution_rates
  WHERE member_id=p_member_id AND effective_from>p_effective_from;

  IF FOUND AND current_rate.effective_from=p_effective_from THEN
    UPDATE public.member_contribution_rates SET monthly_amount=p_amount WHERE id=current_rate.id;
  ELSE
    UPDATE public.member_contribution_rates
    SET effective_to=p_effective_from-1
    WHERE member_id=p_member_id AND effective_from<p_effective_from
      AND (effective_to IS NULL OR effective_to>=p_effective_from);
    INSERT INTO public.member_contribution_rates(member_id,monthly_amount,effective_from,effective_to,created_by)
    VALUES(p_member_id,p_amount,p_effective_from,CASE WHEN next_start IS NULL THEN NULL ELSE next_start-1 END,(SELECT auth.uid()));
  END IF;

  UPDATE public.members
  SET monthly_contribution=p_amount,
      contribution_start_date=coalesce(contribution_start_date,p_effective_from)
  WHERE id=p_member_id;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_member_shared_financial_data();
DROP FUNCTION IF EXISTS private.get_member_shared_financial_data();

DROP FUNCTION IF EXISTS public.save_contribution_matrix(uuid,jsonb);
DROP FUNCTION IF EXISTS private.save_contribution_matrix(uuid,jsonb);
DROP FUNCTION IF EXISTS public.save_member_contribution_rates(jsonb);
DROP FUNCTION IF EXISTS public.save_member_admin_profile(uuid,jsonb,numeric,date);
DROP FUNCTION IF EXISTS public.save_committee_rules(jsonb);
DROP FUNCTION IF EXISTS public.save_committee_proof_metadata(jsonb);
DROP FUNCTION IF EXISTS public.save_financial_transaction_edits(jsonb);
DROP FUNCTION IF EXISTS public.save_notice_updates(jsonb);

DROP TABLE IF EXISTS private.contribution_matrix_operations;
DROP TABLE IF EXISTS public.committee_rules;

DROP POLICY IF EXISTS "Private member docs: Super Admin upload" ON storage.objects;

DROP INDEX IF EXISTS public.committee_documents_uploaded_by_idx;
DROP INDEX IF EXISTS public.member_private_documents_member_id_idx;
DROP INDEX IF EXISTS public.member_private_documents_reviewed_by_idx;
DROP INDEX IF EXISTS public.payment_methods_updated_by_idx;
DROP INDEX IF EXISTS public.committee_rules_updated_by_idx;

-- If any new financial transactions, contribution rates, proof metadata,
-- payment settings, notices, or member profile edits have been saved after
-- deployment, review them against the backup before attempting data rollback.
