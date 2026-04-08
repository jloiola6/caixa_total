import webpush from "web-push";
import { prisma } from "../db.js";
import { config } from "../config.js";

type PushNotificationPayload = {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
  data?: Record<string, unknown>;
};

type StorePushParams = {
  storeId: string;
  payload: PushNotificationPayload;
  excludeDeviceId?: string | null;
};

type PushStats = {
  sent: number;
  failed: number;
  removed: number;
};

const hasVapidCredentials =
  config.webPushVapidPublicKey.trim() !== "" &&
  config.webPushVapidPrivateKey.trim() !== "";

if (hasVapidCredentials) {
  webpush.setVapidDetails(
    config.webPushVapidSubject,
    config.webPushVapidPublicKey,
    config.webPushVapidPrivateKey
  );
} else {
  console.warn(
    "[push] Web Push desabilitado: WEB_PUSH_VAPID_PUBLIC_KEY/WEB_PUSH_VAPID_PRIVATE_KEY ausentes."
  );
}

export function isWebPushEnabled(): boolean {
  return hasVapidCredentials;
}

export function getWebPushPublicKey(): string | null {
  return hasVapidCredentials ? config.webPushVapidPublicKey : null;
}

function buildPushPayload(payload: PushNotificationPayload): string {
  return JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? "/apple-icon.png",
    badge: payload.badge ?? "/icon-light-32x32.png",
    tag: payload.tag,
    data: {
      ...(payload.data ?? {}),
      url: payload.url ?? "/notificacoes",
    },
  });
}

function getErrorStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const maybeStatusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof maybeStatusCode === "number" ? maybeStatusCode : null;
}

export async function sendPushNotificationToStore(
  params: StorePushParams
): Promise<PushStats> {
  if (!hasVapidCredentials) {
    return { sent: 0, failed: 0, removed: 0 };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { storeId: params.storeId },
    select: {
      id: true,
      endpoint: true,
      p256dh: true,
      auth: true,
      expirationTime: true,
      deviceId: true,
    },
  });

  const payload = buildPushPayload(params.payload);
  const staleIds: string[] = [];
  const stats: PushStats = { sent: 0, failed: 0, removed: 0 };

  for (const subscription of subscriptions) {
    if (params.excludeDeviceId && subscription.deviceId === params.excludeDeviceId) {
      continue;
    }

    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          expirationTime: subscription.expirationTime
            ? subscription.expirationTime.getTime()
            : null,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        payload,
        { TTL: 300, urgency: "normal" }
      );
      stats.sent += 1;
    } catch (error) {
      const statusCode = getErrorStatusCode(error);
      if (statusCode === 404 || statusCode === 410) {
        staleIds.push(subscription.id);
      } else {
        stats.failed += 1;
        console.error("[push] Falha ao enviar push:", error);
      }
    }
  }

  if (staleIds.length > 0) {
    const result = await prisma.pushSubscription.deleteMany({
      where: { id: { in: staleIds } },
    });
    stats.removed = result.count;
  }

  return stats;
}
