self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = {};
    }
  }

  const title =
    typeof data.title === "string" && data.title.trim()
      ? data.title.trim()
      : "CaixaTotal";

  const body =
    typeof data.body === "string" && data.body.trim()
      ? data.body.trim()
      : "Nova atualização disponível";

  const icon =
    typeof data.icon === "string" && data.icon.trim()
      ? data.icon.trim()
      : "/apple-icon.png";

  const badge =
    typeof data.badge === "string" && data.badge.trim()
      ? data.badge.trim()
      : "/icon-light-32x32.png";

  const tag =
    typeof data.tag === "string" && data.tag.trim() ? data.tag.trim() : undefined;

  const eventData = data.data && typeof data.data === "object" ? data.data : {};

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      renotify: false,
      data: eventData,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    event.notification.data &&
    typeof event.notification.data.url === "string" &&
    event.notification.data.url
      ? event.notification.data.url
      : "/notificacoes";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        const targetUrl = new URL(url, self.location.origin);
        if (clientUrl.href === targetUrl.href && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
