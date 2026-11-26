-- Atomically claim the member's one-time first-login password prompt.
-- The timestamp is persisted before the page is shown, including if the member
-- closes the page without pressing Skip or changing the password.
CREATE OR REPLACE FUNCTION public.claim_first_login_password_prompt()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles p
  SET password_change_prompt_seen_at = now()
  WHERE p.id = v_user_id
    AND p.role = 'member'
    AND p.must_change_password = true
    AND p.password_change_prompt_seen_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.members m
      WHERE m.auth_user_id = p.id
        AND m.status = 'active'
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_first_login_password_prompt() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_first_login_password_prompt() TO authenticated;
