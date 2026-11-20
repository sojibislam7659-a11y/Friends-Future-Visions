-- Require active linked member status for all approved-member portal access.
-- Super Admin access remains independent of the members table.
CREATE OR REPLACE FUNCTION private.has_portal_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'super_admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.members m
        ON m.auth_user_id = p.id
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'member'
        AND m.status = 'active'
    );
$function$;
