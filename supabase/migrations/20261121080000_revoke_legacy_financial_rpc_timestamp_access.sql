REVOKE EXECUTE ON FUNCTION public.get_member_shared_financial_data() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.get_member_shared_financial_data() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.get_member_shared_financial_data_unchecked() FROM PUBLIC, anon, authenticated;
