ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_endpoint_provider_check
  CHECK (endpoint ~* '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-z0-9-]+[.]notify[.]windows[.]com)/'),
  ADD CONSTRAINT push_subscriptions_p256dh_format_check
  CHECK (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  ADD CONSTRAINT push_subscriptions_auth_key_format_check
  CHECK (auth_key ~ '^[A-Za-z0-9_-]{16,32}$'),
  ADD CONSTRAINT push_subscriptions_user_agent_length_check
  CHECK (user_agent IS NULL OR length(user_agent)<=512);

CREATE OR REPLACE FUNCTION private.enforce_push_subscription_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE existing_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,0));
  SELECT count(*) INTO existing_count FROM public.push_subscriptions WHERE user_id=NEW.user_id AND id<>NEW.id;
  IF existing_count>=5 THEN RAISE EXCEPTION 'A maximum of five push devices may be registered per account'; END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS enforce_push_subscription_limit ON public.push_subscriptions;
CREATE TRIGGER enforce_push_subscription_limit BEFORE INSERT OR UPDATE OF user_id ON public.push_subscriptions
FOR EACH ROW EXECUTE FUNCTION private.enforce_push_subscription_limit();

DROP POLICY IF EXISTS push_subscriptions_select_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select_own ON public.push_subscriptions FOR SELECT TO authenticated
USING (user_id=(SELECT auth.uid()) AND (SELECT private.has_portal_access()));
DROP POLICY IF EXISTS push_subscriptions_insert_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_insert_own ON public.push_subscriptions FOR INSERT TO authenticated
WITH CHECK (user_id=(SELECT auth.uid()) AND (SELECT private.has_portal_access()));
DROP POLICY IF EXISTS push_subscriptions_update_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_update_own ON public.push_subscriptions FOR UPDATE TO authenticated
USING (user_id=(SELECT auth.uid()) AND (SELECT private.has_portal_access()))
WITH CHECK (user_id=(SELECT auth.uid()) AND (SELECT private.has_portal_access()));
DROP POLICY IF EXISTS push_subscriptions_delete_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete_own ON public.push_subscriptions FOR DELETE TO authenticated
USING (user_id=(SELECT auth.uid()) AND (SELECT private.has_portal_access()));

CREATE TABLE public.notification_push_deliveries (
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0 AND attempts<=5),
  last_status_code integer,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(notification_id,subscription_id)
);
ALTER TABLE public.notification_push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_push_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notification_push_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.claim_notification_push_delivery(p_notification_id uuid,p_subscription_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_attempts integer;
BEGIN
  IF (SELECT auth.jwt()->>'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.notification_push_deliveries(notification_id,subscription_id,status,attempts,updated_at)
  VALUES(p_notification_id,p_subscription_id,'sending',1,now())
  ON CONFLICT(notification_id,subscription_id) DO UPDATE
    SET status='sending',attempts=public.notification_push_deliveries.attempts+1,updated_at=now()
    WHERE public.notification_push_deliveries.status<>'sent'
      AND public.notification_push_deliveries.attempts<5
      AND (public.notification_push_deliveries.status<>'sending'
           OR public.notification_push_deliveries.updated_at<now()-interval '10 minutes')
  RETURNING attempts INTO v_attempts;
  RETURN coalesce(v_attempts,0);
END;
$function$;
REVOKE ALL ON FUNCTION public.claim_notification_push_delivery(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_push_delivery(uuid,uuid) TO service_role;
