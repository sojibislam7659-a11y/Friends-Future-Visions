-- Allow only Super Admin to export the committee-wide notification history.
-- Ordinary members retain access to their own notifications only.
CREATE POLICY "notifications_read_super_admin"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING ((SELECT private.is_super_admin()));
