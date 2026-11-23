DROP POLICY IF EXISTS "Profiles: Super Admin update" ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own_password_flag ON public.profiles;
CREATE POLICY profiles_update_super_admin_or_password_flag
ON public.profiles FOR UPDATE TO authenticated
USING (
  (SELECT private.is_super_admin())
  OR (
    id=(SELECT auth.uid()) AND role='member' AND must_change_password=true
    AND EXISTS(SELECT 1 FROM public.members m WHERE m.auth_user_id=profiles.id AND m.status='active')
  )
)
WITH CHECK (
  (SELECT private.is_super_admin())
  OR (
    id=(SELECT auth.uid()) AND role='member' AND must_change_password=false
    AND EXISTS(SELECT 1 FROM public.members m WHERE m.auth_user_id=profiles.id AND m.status='active')
  )
);
