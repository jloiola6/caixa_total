import "dotenv/config";

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória não definida: ${key}`);
  }
  return value;
};

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  frontUrl: process.env.FRONT_URL ?? "http://localhost:3000",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendFrom: process.env.RESEND_FROM ?? "onboarding@resend.dev",
  webPushVapidSubject: process.env.WEB_PUSH_VAPID_SUBJECT ?? "mailto:suporte@caixatotal.app",
  webPushVapidPublicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "",
  webPushVapidPrivateKey: process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? "",
  isProduction: process.env.NODE_ENV === "production",
  /** Bucket GCS para fotos de produto (opcional; sem isso, upload fica desativado). */
  gcsBucketName: process.env.GCS_BUCKET_NAME ?? "",
  /** Base pública, ex.: https://storage.googleapis.com/nome-do-bucket */
  gcsPublicBaseUrl: process.env.GCS_PUBLIC_BASE_URL ?? "",
} as const;
