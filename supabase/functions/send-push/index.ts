import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const headers = { "Content-Type": "application/json" };
const MAX_NOTIFICATION_ATTEMPTS = 5;

function allowedPushEndpoint(raw: string): boolean {
  try {
    const endpoint = new URL(raw);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.port) return false;
    const host = endpoint.hostname.toLowerCase();
    return host === "fcm.googleapis.com"
      || host === "updates.push.services.mozilla.com"
      || host === "web.push.apple.com"
      || (host.endsWith(".notify.windows.com") && host.length > ".notify.windows.com".length);
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return new Response(JSON.stringify({ error: "Server configuration unavailable" }), { status: 500, headers });
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: config, error: configError } = await supabase.rpc("get_push_config");
  if (configError || !config?.vapid_public_key || !config?.vapid_private_key || !config?.vapid_subject || !config?.cron_token) {
    return new Response(JSON.stringify({ error: "Push configuration unavailable" }), { status: 503, headers });
  }
  if (req.headers.get("x-ffvf-cron-token") !== config.cron_token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  webpush.setVapidDetails(config.vapid_subject, config.vapid_public_key, config.vapid_private_key);

  const { data: pending, error: pendingError } = await supabase
    .from("notifications")
    .select("id,user_id,push_attempts")
    .is("push_sent_at", null)
    .lt("push_attempts", MAX_NOTIFICATION_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(75);

  if (pendingError) {
    return new Response(JSON.stringify({ error: "Could not load pending notifications" }), { status: 500, headers });
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let removed = 0;

  for (const notification of pending ?? []) {
    const { data: subscriptions, error: subscriptionError } = await supabase
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth_key")
      .eq("user_id", notification.user_id);

    if (subscriptionError) {
      const nextAttempt = Number(notification.push_attempts || 0) + 1;
      await supabase.from("notifications").update({
        push_attempts: nextAttempt,
        ...(nextAttempt >= MAX_NOTIFICATION_ATTEMPTS ? { push_sent_at: new Date().toISOString() } : {})
      }).eq("id", notification.id);
      failed++;
      continue;
    }

    if (!subscriptions?.length) {
      await supabase.from("notifications").update({
        push_sent_at: new Date().toISOString(),
        push_attempts: Number(notification.push_attempts || 0) + 1
      }).eq("id", notification.id);
      skipped++;
      continue;
    }

    let hadFailure = false;
    let claimedAny = false;
    for (const sub of subscriptions) {
      if (!allowedPushEndpoint(sub.endpoint)) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        removed++;
        continue;
      }

      const { data: attemptNumber, error: claimError } = await supabase.rpc(
        "claim_notification_push_delivery",
        { p_notification_id: notification.id, p_subscription_id: sub.id }
      );

      if (claimError) {
        hadFailure = true;
        failed++;
        continue;
      }
      if (!Number(attemptNumber || 0)) {
        // Already sent, or another worker currently owns this delivery attempt.
        continue;
      }
      claimedAny = true;

      try {
        const payload = JSON.stringify({
          title: "Friends Future Vision",
          body: "You have a notification from Friends Future Vision."
        });
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          payload
        );
        const { error: savedError } = await supabase
          .from("notification_push_deliveries")
          .update({ status: "sent", last_status_code: 201, last_error: null, updated_at: new Date().toISOString() })
          .eq("notification_id", notification.id)
          .eq("subscription_id", sub.id);
        if (savedError) {
          hadFailure = true;
          failed++;
        } else {
          sent++;
        }
      } catch (error) {
        const status = Number((error as { statusCode?: number })?.statusCode || 0);
        if (status === 404 || status === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          removed++;
          continue;
        }
        await supabase.from("notification_push_deliveries").update({
          status: "failed",
          last_status_code: status || null,
          last_error: "Push provider request failed",
          updated_at: new Date().toISOString()
        }).eq("notification_id", notification.id).eq("subscription_id", sub.id);
        hadFailure = true;
        failed++;
      }
    }

    const { count: unresolvedCount, error: unresolvedError } = await supabase
      .from("notification_push_deliveries")
      .select("subscription_id", { count: "exact", head: true })
      .eq("notification_id", notification.id)
      .neq("status", "sent");
    const { count: exhaustedCount, error: exhaustedError } = await supabase
      .from("notification_push_deliveries")
      .select("subscription_id", { count: "exact", head: true })
      .eq("notification_id", notification.id)
      .neq("status", "sent")
      .gte("attempts", MAX_NOTIFICATION_ATTEMPTS);

    const nextAttempt = Number(notification.push_attempts || 0) + 1;
    const update: Record<string, unknown> = {};
    if (claimedAny || hadFailure) update.push_attempts = nextAttempt;
    if (!unresolvedError && !exhaustedError && !hadFailure && Number(unresolvedCount || 0) === 0) {
      update.push_sent_at = new Date().toISOString();
    } else if (!exhaustedError && Number(unresolvedCount || 0) > 0 && Number(exhaustedCount || 0) >= Number(unresolvedCount || 0)) {
      update.push_sent_at = new Date().toISOString();
    } else if ((claimedAny || hadFailure) && nextAttempt >= MAX_NOTIFICATION_ATTEMPTS) {
      update.push_sent_at = new Date().toISOString();
    }
    if (Object.keys(update).length) {
      await supabase.from("notifications").update(update).eq("id", notification.id);
    }
  }

  return new Response(JSON.stringify({
    processed: pending?.length ?? 0,
    sent,
    failed,
    skipped,
    removed
  }), { status: 200, headers });
});
