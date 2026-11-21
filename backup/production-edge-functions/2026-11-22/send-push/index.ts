import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const headers = { "Content-Type": "application/json" };

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return new Response(JSON.stringify({ error: "Server configuration unavailable" }), { status: 500, headers });

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: config, error: configError } = await supabase.rpc("get_push_config");
  if (configError || !config?.vapid_public_key || !config?.vapid_private_key || !config?.vapid_subject || !config?.cron_token) {
    return new Response(JSON.stringify({ error: "Push configuration unavailable" }), { status: 503, headers });
  }
  if (req.headers.get("x-ffvf-cron-token") !== config.cron_token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  webpush.setVapidDetails(config.vapid_subject, config.vapid_public_key, config.vapid_private_key);
  const { data: pending, error: pendingError } = await supabase
    .from("notifications").select("id,user_id,push_attempts")
    .is("push_sent_at", null).lt("push_attempts", 5)
    .order("created_at", { ascending: true }).limit(75);
  if (pendingError) return new Response(JSON.stringify({ error: "Could not load pending notifications" }), { status: 500, headers });

  let sent = 0, failed = 0, skipped = 0;
  for (const notification of pending ?? []) {
    const attempts = Number(notification.push_attempts || 0) + 1;
    const { data: subscriptions, error: subscriptionError } = await supabase
      .from("push_subscriptions").select("id,endpoint,p256dh,auth_key").eq("user_id", notification.user_id);
    if (subscriptionError) {
      failed++;
      await supabase.from("notifications").update({ push_attempts: attempts }).eq("id", notification.id);
      continue;
    }
    if (!subscriptions?.length) {
      skipped++;
      await supabase.from("notifications").update({ push_sent_at: new Date().toISOString(), push_attempts: attempts }).eq("id", notification.id);
      continue;
    }

    let hadFailure = false;
    const payload = JSON.stringify({ title: "Friends Future Vision", body: "You have a notification from Friends Future Vision." });
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload);
        sent++;
      } catch (error) {
        const status = Number((error as { statusCode?: number })?.statusCode || 0);
        if (status === 404 || status === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          hadFailure = true;
          failed++;
        }
      }
    }
    await supabase.from("notifications").update({
      push_attempts: attempts,
      ...(hadFailure && attempts < 5 ? {} : { push_sent_at: new Date().toISOString() })
    }).eq("id", notification.id);
  }
  return new Response(JSON.stringify({ processed: pending?.length ?? 0, sent, failed, skipped }), { status: 200, headers });
});