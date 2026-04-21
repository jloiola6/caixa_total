import { Storage } from "@google-cloud/storage";
import { config } from "../config.js";

let storage: Storage | null = null;

function getClient(): Storage | null {
  if (!config.gcsBucketName) return null;
  if (!storage) storage = new Storage();
  return storage;
}

export function isGcsConfigured(): boolean {
  return Boolean(config.gcsBucketName && config.gcsPublicBaseUrl);
}

export async function getSignedProductImageUploadUrl(params: {
  objectName: string;
  contentType: string;
  expiresMs: number;
}): Promise<string> {
  const client = getClient();
  if (!client || !config.gcsBucketName) {
    throw new Error("GCS não configurado");
  }
  const file = client.bucket(config.gcsBucketName).file(params.objectName);
  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + params.expiresMs,
    contentType: params.contentType,
  });
  return url;
}

/** URL pública de leitura (bucket com leitura pública configurada). */
export function publicObjectUrl(objectName: string): string {
  const base = config.gcsPublicBaseUrl.replace(/\/$/, "");
  const path = objectName
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${base}/${path}`;
}
