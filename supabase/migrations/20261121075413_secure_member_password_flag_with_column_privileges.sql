CREATE OR REPLACE FUNCTION private.guard_temporary_password_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_auth_updated_at timestamptz;
BEGIN
  IF OLD.must_change_password=true AND NEW.must_change_password=false THEN
    SELECT u.updated_at INTO v_auth_updated_at FROM auth.users u WHERE u.id=OLD.id;
    IF OLD.password_change_required_at IS NULL OR v_auth_updated_at IS NULL
       OR v_auth_updated_at<=OLD.password_change_required_at THEN
      RAISE EXCEPTION 'A new password must be saved before completing this step' USING ERRCODE='42501';
    END IF;
    NEW.password_change_required_at:=NULL;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS guard_temporary_password_change ON public.profiles;
CREATE TRIGGER guard_temporary_password_change BEFORE UPDATE OF must_change_password ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.guard_temporary_password_change();

DROP POLICY IF EXISTS profiles_update_own_password_flag ON public.profiles;
CREATE POLICY profiles_update_own_password_flag ON public.profiles FOR UPDATE TO authenticated
USING (id=(SELECT auth.uid()) AND role='member' AND must_change_password=true
  AND EXISTS(SELECT 1 FROM public.members m WHERE m.auth_user_id=profiles.id AND m.status='active'))
WITH CHECK (id=(SELECT auth.uid()) AND role='member' AND must_change_password=false
  AND EXISTS(SELECT 1 FROM public.members m WHERE m.auth_user_id=profiles.id AND m.status='active'));

REVOKE INSERT,UPDATE,DELETE ON public.profiles FROM authenticated;
REVOKE INSERT (created_at,email,email_verified_at,full_name,id,must_change_password,password_change_required_at,role),
       UPDATE (created_at,email,email_verified_at,full_name,id,must_change_password,password_change_required_at,role)
ON public.profiles FROM authenticated;
GRANT UPDATE (must_change_password) ON public.profiles TO authenticated;
DROP FUNCTION IF EXISTS public.complete_required_password_change();
