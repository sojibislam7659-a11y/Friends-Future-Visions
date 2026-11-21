-- Keep notification reads in one permissive policy for predictable RLS evaluation.
-- Members see only their own rows; Super Admin can read the committee-wide history for exports.
DROP POLICY IF EXISTS "notifications_read_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_read_super_admin" ON public.notifications;

CREATE POLICY "notifications_read_own_or_super_admin"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT private.is_super_admin())
  );
