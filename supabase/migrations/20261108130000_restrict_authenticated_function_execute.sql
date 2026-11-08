-- Development hardening: remove blanket authenticated EXECUTE grants.
-- Only client-required RPCs and RLS helper functions are re-granted.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM authenticated;

GRANT EXECUTE ON FUNCTION private.has_portal_access() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.review_profile_change_request(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.set_member_contribution_rate(uuid, numeric, date) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_financial_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_payment_submission(uuid, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_private_document(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_profile_change_request(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_current_committee_document(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_member_contribution_rate(uuid, numeric, date) TO authenticated;
