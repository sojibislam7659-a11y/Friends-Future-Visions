ALTER TABLE public.profiles
ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION private.has_portal_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='super_admin')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.members m ON m.auth_user_id=p.id
      WHERE p.id=(SELECT auth.uid()) AND p.role='member'
        AND m.status='active' AND coalesce(p.must_change_password,false)=false
    );
$function$;

CREATE OR REPLACE FUNCTION public.complete_required_password_change()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_user_id uuid := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p JOIN public.members m ON m.auth_user_id=p.id
    WHERE p.id=v_user_id AND p.role='member' AND m.status='active'
  ) THEN RAISE EXCEPTION 'Active member account required' USING ERRCODE='42501'; END IF;
  UPDATE public.profiles SET must_change_password=false WHERE id=v_user_id AND must_change_password=true;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.complete_required_password_change() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_required_password_change() TO authenticated;
