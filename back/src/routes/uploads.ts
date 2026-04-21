import crypto from "crypto";
import { Router } from "express";
import { authMiddleware, requireStoreUserOrSuperAdmin } from "../middleware/auth.js";
import {
  getSignedProductImageUploadUrl,
  isGcsConfigured,
  publicObjectUrl,
} from "../lib/gcs.js";

export const uploadsRouter = Router();
uploadsRouter.use(authMiddleware);
uploadsRouter.use(requireStoreUserOrSuperAdmin);

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 2 * 1024 * 1024;

function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "bin";
}

uploadsRouter.post("/product-image/sign", async (req, res) => {
  try {
    if (!isGcsConfigured()) {
      res.status(503).json({
        error: "Upload de imagens não configurado. Defina GCS_BUCKET_NAME e GCS_PUBLIC_BASE_URL.",
      });
      return;
    }

    const body = req.body as { storeId?: string; contentType?: string; fileSize?: number };
    const storeId: string | null =
      req.user!.role === "STORE_USER" ? req.user!.storeId : (body.storeId ?? null) || null;
    if (!storeId) {
      res.status(400).json({ error: "storeId é obrigatório (envie no body para super admin)" });
      return;
    }

    const contentType = typeof body.contentType === "string" ? body.contentType.trim() : "";
    if (!contentType || !ALLOWED_TYPES.has(contentType)) {
      res.status(400).json({
        error: "contentType inválido. Use image/jpeg, image/png, image/webp ou image/gif.",
      });
      return;
    }

    const fileSize = Number(body.fileSize);
    if (!Number.isFinite(fileSize) || fileSize < 1 || fileSize > MAX_BYTES) {
      res.status(400).json({ error: `Tamanho inválido. Máximo ${MAX_BYTES} bytes (2MB).` });
      return;
    }

    const objectId = crypto.randomUUID();
    const objectName = `stores/${storeId}/images/${objectId}.${extFromMime(contentType)}`;

    const uploadUrl = await getSignedProductImageUploadUrl({
      objectName,
      contentType,
      expiresMs: 15 * 60 * 1000,
    });
    const publicUrl = publicObjectUrl(objectName);

    res.json({ uploadUrl, publicUrl, objectName });
  } catch (e) {
    console.error("uploads sign error:", e);
    res.status(500).json({ error: "Falha ao gerar URL de upload" });
  }
});
