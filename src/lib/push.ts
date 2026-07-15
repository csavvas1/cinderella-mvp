import { supabase } from "./supabase";

// Web Push subscription: ask the browser to subscribe this device to push using
// our VAPID public key, then save the subscription to Supabase so the send-push
// Edge Function can deliver notifications even when the app is closed.

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC as string;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Ask permission + subscribe + persist. Returns granted state.
export async function enablePush(): Promise<{ granted: boolean; error?: string }> {
  try {
    if (typeof Notification === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      return { granted: false, error: "Push not supported on this device." };
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { granted: false };

    // serviceWorker.ready never resolves if no SW is registered — cap the wait so
    // a misconfigured build surfaces an error instead of hanging silently.
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Service worker not ready — is the PWA registered?")), 5000)),
    ]);
    // reuse an existing subscription if present, else create one
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      if (!VAPID_PUBLIC) return { granted: true, error: "Missing VAPID key (VITE_VAPID_PUBLIC)." };
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
      });
    }
    await saveSubscription(sub);
    return { granted: true };
  } catch (e) {
    return { granted: false, error: (e as Error).message };
  }
}

// Unsubscribe this device from Web Push and remove its saved subscription so it
// stops receiving notifications. Browser permission stays granted (the user can
// re-enable without another prompt) — we just tear down the subscription.
export async function disablePush(): Promise<{ error?: string }> {
  try {
    if (!("serviceWorker" in navigator)) return {};
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    }
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

async function saveSubscription(sub: PushSubscription) {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) return; // only real signed-in users persist
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
  await supabase.from("push_subscriptions").upsert({
    endpoint: json.endpoint,
    user_id: uid,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  });
}

// Best-effort: if the browser already has a subscription + a session, make sure
// it's saved (e.g. after logging in on a device that granted push before).
export async function syncExistingSubscription() {
  try {
    if (!("serviceWorker" in navigator) || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await saveSubscription(sub);
  } catch { /* ignore */ }
}
