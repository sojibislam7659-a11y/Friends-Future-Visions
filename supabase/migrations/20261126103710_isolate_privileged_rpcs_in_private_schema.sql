BEGIN;

-- Move the four intentionally privileged implementations out of the exposed
-- public API schema. Keep their public RPC names as SECURITY INVOKER wrappers.
ALTER FUNCTION public.claim_first_login_password_prompt() SET SCHEMA private;
ALTER FUNCTION public.complete_required_password_change() SET SCHEMA private;
ALTER FUNCTION public.dismiss_first_login_password_prompt() SET SCHEMA private;
ALTER FUNCTION public.get_public_financial_summary() SET SCHEMA private;

-- The public aggregate is intentionally available to anonymous visitors.
GRANT USAGE ON SCHEMA private TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_public_financial_summary() TO anon, authenticated;

-- Password-prompt internals remain callable only by authenticated sessions.
GRANT EXECUTE ON FUNCTION private.claim_first_login_password_prompt() TO authenticated;
GRANT EXECUTE ON FUNCTION private.complete_required_password_change() TO authenticated;
GRANT EXECUTE ON FUNCTION private.dismiss_first_login_password_prompt() TO authenticated;
REVOKE EXECUTE ON FUNCTION private.claim_first_login_password_prompt() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION private.complete_required_password_change() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION private.dismiss_first_login_password_prompt() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION private.get_public_financial_summary() FROM PUBLIC;

-- Preserve the existing PostgREST RPC contract while making the exposed
-- wrappers SECURITY INVOKER (RLS and caller privileges remain in effect).
CREATE FUNCTION public.claim_first_login_password_prompt()
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.claim_first_login_password_prompt();
$function$;

CREATE FUNCTION public.complete_required_password_change()
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.complete_required_password_change();
$function$;

CREATE FUNCTION public.dismiss_first_login_password_prompt()
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.dismiss_first_login_password_prompt();
$function$;

CREATE FUNCTION public.get_public_financial_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.get_public_financial_summary();
$function$;

-- Explicit least-privilege API grants; no implicit PUBLIC access.
REVOKE EXECUTE ON FUNCTION public.claim_first_login_password_prompt() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.complete_required_password_change() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dismiss_first_login_password_prompt() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_public_financial_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_first_login_password_prompt() TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_required_password_change() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_first_login_password_prompt() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_financial_summary() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;