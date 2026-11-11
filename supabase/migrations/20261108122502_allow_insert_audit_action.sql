-- Development-only correction: the insert audit trigger records INSERT actions,
-- so the audit table must permit INSERT as well as UPDATE and DELETE.
ALTER TABLE public.financial_transaction_audit
  DROP CONSTRAINT financial_transaction_audit_action_check;

ALTER TABLE public.financial_transaction_audit
  ADD CONSTRAINT financial_transaction_audit_action_check
  CHECK (action = ANY (ARRAY['INSERT'::text,'UPDATE'::text,'DELETE'::text]));
