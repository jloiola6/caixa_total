/**
 * Migração one-shot: produtos com imageUrl em data:image/...;base64,... para objetos no GCS
 * e atualiza imageUrl para URL HTTPS pública.
 *
 * Requer no ambiente:
 * - DATABASE_URL
 * - GCS_BUCKET_NAME, GCS_PUBLIC_BASE_URL (iguais ao backend)
 * - Credenciais GCP para **Node.js** (não basta `gcloud auth login`):
 *   `gcloud auth application-default login` **ou** `GOOGLE_APPLICATION_CREDENTIALS=/caminho/sa.json`
 *
 * Uso (a partir da pasta back/):
 *   pnpm exec tsx scripts/migrate-product-images-to-gcs.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Storage } from "@google-cloud/storage";

const prisma = new PrismaClient();
const bucketName = process.env.GCS_BUCKET_NAME;
const publicBase = process.env.GCS_PUBLIC_BASE_URL?.replace(/\/$/, "");

function parseDataUrl(dataUrl: string): { buffer: Buffer; mime: string } | null {
  const m = /^data:([^;,]+)(?:;[^;,]*)*;base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  const mime = m[1].trim().toLowerCase();
  const b64 = m[2].replace(/\s/g, "");
  try {
    const buffer = Buffer.from(b64, "base64");
    if (!buffer.length) return null;
    return { buffer, mime };
  } catch {
    return null;
  }
}

function extFromMime(mime: string): string {
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "bin";
}

function publicUrl(objectName: string): string {
  if (!publicBase) throw new Error("GCS_PUBLIC_BASE_URL ausente");
  const path = objectName
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${publicBase}/${path}`;
}

async function main() {
  if (!bucketName || !publicBase) {
    console.error("Defina GCS_BUCKET_NAME e GCS_PUBLIC_BASE_URL.");
    process.exit(1);
  }

  const storage = new Storage(
    process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? { keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS }
      : {},
  );
  const bucket = storage.bucket(bucketName);

  try {
    await bucket.getMetadata();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Could not load the default credentials") || msg.includes("default credentials")) {
      console.error(`
ERRO: sem credenciais GCP para o SDK Node (@google-cloud/storage).

  gcloud auth login          → só autentica o CLI (gcloud), não scripts Node.

Faça UMA destas opções e volte a correr a migração:

  1) gcloud auth application-default login

  2) export GOOGLE_APPLICATION_CREDENTIALS=/caminho/para/service-account.json
     (conta com roles/storage.objectAdmin no bucket)
`);
      process.exit(1);
    }
    throw e;
  }

  const rows = await prisma.product.findMany({
    where: { imageUrl: { startsWith: "data:image" } },
    select: { id: true, storeId: true, imageUrl: true },
  });

  console.log(`Encontrados ${rows.length} produto(s) com imagem em base64.`);

  let ok = 0;
  let fail = 0;

  for (const row of rows) {
    const raw = row.imageUrl;
    if (!raw) continue;
    const parsed = parseDataUrl(raw);
    if (!parsed) {
      console.error(`[skip] ${row.id}: data URL inválida`);
      fail++;
      continue;
    }
    const ext = extFromMime(parsed.mime);
    const objectName = `stores/${row.storeId}/images/migrated-${row.id}.${ext}`;
    try {
      const file = bucket.file(objectName);
      await file.save(parsed.buffer, {
        contentType: parsed.mime,
        metadata: { contentType: parsed.mime },
        resumable: false,
      });
      const url = publicUrl(objectName);
      await prisma.product.update({
        where: { id: row.id },
        data: { imageUrl: url },
      });
      console.log(`[ok] ${row.id} -> ${url}`);
      ok++;
    } catch (e) {
      console.error(`[fail] ${row.id}:`, e);
      fail++;
    }
  }

  console.log(`Concluído. Sucesso: ${ok}, falhas: ${fail}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
