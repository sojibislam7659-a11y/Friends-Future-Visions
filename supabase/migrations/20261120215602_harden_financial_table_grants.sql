-- Reduce the exposed privilege surface for financial source tables.
-- All financial writes must go through the approved SECURITY DEFINER RPCs.
REVOKE ALL PRIVILEGES ON TABLE public.financial_transactions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.financial_transactions FROM authenticated;
GRANT SELECT ON TABLE public.financial_transactions TO authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.member_contribution_rates FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.member_contribution_rates FROM authenticated;
GRANT SELECT ON TABLE public.member_contribution_rates TO authenticated;
