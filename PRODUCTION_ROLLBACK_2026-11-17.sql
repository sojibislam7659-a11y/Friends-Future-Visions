-- Production rollback for the 2026-11-17 release additions.
-- Run only after rolling the frontend back to the pre-change Main commit.
-- IMPORTANT: This removes the new editor functions and the rules content table.
-- It deliberately does NOT delete financial_transactions, contribution rates,
-- payment submissions, proof files, notice rows, or member/profile data.

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
