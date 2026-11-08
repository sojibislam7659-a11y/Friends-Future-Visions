-- Ledger writes must pass through the guarded SECURITY DEFINER posting/reversal helpers.
-- The service_role key is not a reason to permit direct ledger mutation.
REVOKE ALL ON TABLE public.financial_transactions, public.financial_postings FROM service_role;
GRANT SELECT ON TABLE public.financial_transactions, public.financial_postings TO service_role;
