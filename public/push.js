import { VAPID_PUBLIC_KEY } from "./push-config.js";

function decodeKey(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((ch) => ch.charCodeAt(0)));
}

export async function enablePush(supabase, userId) {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("এই Browser-এ Push notification সমর্থিত নয়।");
  }
  if (!VAPID_PUBLIC_KEY) throw new Error("Push key configured নয়।");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission দেওয়া হয়নি।");
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeKey(VAPID_PUBLIC_KEY)
    });
  }
  const json = subscription.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert({
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth_key: json.keys?.auth,
    user_agent: navigator.userAgent,
    updated_at: new Date().toISOString()
  }, { onConflict: "endpoint" });
  if (error) throw error;
  return true;
}