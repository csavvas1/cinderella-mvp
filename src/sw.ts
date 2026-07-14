/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { clientsClaim } from "workbox-core";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// workbox precache (injected at build) + take control immediately
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);
self.skipWaiting();
clientsClaim();

// ---- Web Push -------------------------------------------------------------
// A push message carries a JSON payload { title, body, url? }. Show it as a
// system notification even when the app is closed.
self.addEventListener("push", (event: PushEvent) => {
  let data: { title?: string; body?: string; url?: string; tag?: string } = {};
  try { data = event.data?.json() ?? {}; } catch { data = { body: event.data?.text() }; }
  const title = data.title || "Σιντερέλλα";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag,
      icon: "/pwa-192.png",
      badge: "/pwa-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

// Tapping a notification focuses an open window (or opens one) at the target URL.
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) { await c.focus(); return; }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
