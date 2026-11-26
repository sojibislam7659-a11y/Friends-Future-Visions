-- Optional, one-time first-login password prompt for members.
-- The per-profile marker is shared across browsers/devices and is never reset by this flow.
-- Skipping the prompt records the dismissal without forcing a password rotation.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_change_prompt_seen_at timestamptz;

CREATE OR REPLACE FUNCTION private.has_portal_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.members m ON m.auth_user_id = p.id
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'member'
        AND m.status = 'active'
    );
$function$;

CREATE OR REPLACE FUNCTION public.dismiss_first_login_password_prompt()
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.members m ON m.auth_user_id = p.id
    WHERE p.id = v_user_id
      AND p.role = 'member'
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active member account required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET password_change_prompt_seen_at = COALESCE(password_change_prompt_seen_at, now())
  WHERE id = v_user_id AND role = 'member';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Password prompt could not be dismissed' USING ERRCODE = '42501';
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.dismiss_first_login_password_prompt() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_first_login_password_prompt() TO authenticated;
