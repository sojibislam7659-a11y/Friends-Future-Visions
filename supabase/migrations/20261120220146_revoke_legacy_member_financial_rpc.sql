-- Retire the legacy member financial RPC that still exposed the December 2026 period.
-- All active clients use the January 2027–December 2031 v2 RPC.
REVOKE EXECUTE ON FUNCTION public.get_member_shared_financial_data() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.get_member_shared_financial_data() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.get_member_shared_financial_data_unchecked() FROM PUBLIC, anon, authenticated;
