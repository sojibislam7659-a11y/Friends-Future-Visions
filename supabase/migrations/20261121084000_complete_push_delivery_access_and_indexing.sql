CREATE POLICY notification_push_deliveries_service_role_all
ON public.notification_push_deliveries
FOR ALL TO service_role
USING (true)
WITH CHECK (true);
CREATE INDEX notification_push_deliveries_subscription_idx
ON public.notification_push_deliveries(subscription_id);
