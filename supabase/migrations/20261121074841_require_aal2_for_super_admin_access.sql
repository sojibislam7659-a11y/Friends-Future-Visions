CREATE OR REPLACE FUNCTION private.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id=(SELECT auth.uid()) AND p.role='super_admin'
      AND (SELECT auth.jwt()->>'aal')='aal2'
  );
$function$;

CREATE OR REPLACE FUNCTION private.has_portal_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id=(SELECT auth.uid()) AND p.role='super_admin'
        AND (SELECT auth.jwt()->>'aal')='aal2'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.members m ON m.auth_user_id=p.id
      WHERE p.id=(SELECT auth.uid()) AND p.role='member'
        AND m.status='active' AND coalesce(p.must_change_password,false)=false
    );
$function$;
