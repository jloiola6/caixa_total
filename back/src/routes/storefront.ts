import { Router } from "express";
import { prisma } from "../db.js";

export const storefrontRouter = Router();

function normalizeSlug(rawSlug: string | undefined): string {
  return (rawSlug ?? "").trim().toLowerCase();
}

storefrontRouter.get("/:slug/products", async (req, res) => {
  try {
    const slug = normalizeSlug(req.params.slug);
    if (!slug) {
      res.status(400).json({ error: "Slug da loja é obrigatório" });
      return;
    }

    const store = await prisma.store.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        onlineStoreEnabled: true,
        onlineStoreWhatsappNumber: true,
        onlineStoreWhatsappMessage: true,
        stockAlertLowColor: true,
        stockAlertOutColor: true,
        stockAlertOkColor: true,
        stockAlertLowThreshold: true,
        stockAlertAvailableThreshold: true,
      },
    });

    if (!store || !store.onlineStoreEnabled) {
      res.status(404).json({ error: "Loja não encontrada ou loja online indisponível" });
      return;
    }

    const products = await prisma.product.findMany({
      where: { storeId: store.id },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
        stock: true,
        priceCents: true,
        category: true,
        imageUrl: true,
        type: true,
        brand: true,
        model: true,
        size: true,
        color: true,
        description: true,
        controlNumber: true,
        createdAt: true,
        updatedAt: true,
        tennisSizes: {
          orderBy: [{ number: "asc" }],
          select: {
            id: true,
            number: true,
            stock: true,
            sku: true,
            barcode: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        clothingSizes: {
          orderBy: [{ number: "asc" }],
          select: {
            id: true,
            number: true,
            stock: true,
            sku: true,
            barcode: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    res.status(200).json({
      store: {
        id: store.id,
        name: store.name,
        slug: store.slug,
        onlineStoreWhatsappNumber: store.onlineStoreWhatsappNumber,
        onlineStoreWhatsappMessage: store.onlineStoreWhatsappMessage,
        stockAlertLowColor: store.stockAlertLowColor,
        stockAlertOutColor: store.stockAlertOutColor,
        stockAlertOkColor: store.stockAlertOkColor,
        stockAlertLowThreshold: store.stockAlertLowThreshold,
        stockAlertAvailableThreshold: store.stockAlertAvailableThreshold,
      },
      products,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Storefront products error:", error);
    res.status(500).json({ error: "Erro ao carregar vitrine da loja" });
  }
});
