import { AppError } from "../../domain/errors.js";
import { messages } from "../../domain/messages.js";
import type { CatalogClient, CatalogProduct, PriceList } from "../../ports.js";

type WireProduct = {
  sku?: unknown;
  name?: unknown;
  amountCents?: unknown;
  currency?: unknown;
  price?: { amountCents?: unknown; currency?: unknown };
};

/**
 * The catalog HTTP body nests money under `price`. Unit tests and the in-memory
 * fake pass the flat shape. Either shape becomes CatalogProduct before the use case.
 */
function toProduct(raw: unknown): CatalogProduct | null {
  if (raw === null || typeof raw !== "object") return null;
  const row = raw as WireProduct;
  const amountCents = row.price?.amountCents ?? row.amountCents;
  const currency = row.price?.currency ?? row.currency;
  if (typeof row.sku !== "string" || typeof row.name !== "string") return null;
  if (typeof amountCents !== "number" || typeof currency !== "string") return null;
  return { sku: row.sku, name: row.name, amountCents, currency };
}

export function createCatalogClient(baseUrl: string, fetchImpl: typeof fetch = fetch): CatalogClient {
  const root = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return {
    async getPrices(skus: string[]): Promise<PriceList> {
      const url = new URL("products", root);
      url.searchParams.set("skus", skus.join(","));
      let response: Response;
      try {
        response = await fetchImpl(url, { signal: AbortSignal.timeout(2000) });
      } catch {
        throw new AppError("CATALOG_UNAVAILABLE", 503, messages.CATALOG_UNAVAILABLE);
      }
      if (!response.ok) {
        throw new AppError("CATALOG_UNAVAILABLE", 503, messages.CATALOG_UNAVAILABLE);
      }
      let body: { products?: unknown; missing?: unknown };
      try {
        body = (await response.json()) as { products?: unknown; missing?: unknown };
      } catch {
        throw new AppError("CATALOG_UNAVAILABLE", 503, messages.CATALOG_UNAVAILABLE);
      }
      if (!Array.isArray(body.products) || !Array.isArray(body.missing)) {
        throw new AppError("CATALOG_UNAVAILABLE", 503, messages.CATALOG_UNAVAILABLE);
      }
      if (!body.missing.every((sku) => typeof sku === "string")) {
        throw new AppError("CATALOG_UNAVAILABLE", 503, messages.CATALOG_UNAVAILABLE);
      }
      const products: CatalogProduct[] = [];
      for (const raw of body.products) {
        const product = toProduct(raw);
        if (!product) {
          throw new AppError("CATALOG_UNAVAILABLE", 503, messages.CATALOG_UNAVAILABLE);
        }
        products.push(product);
      }
      return { products, missing: body.missing };
    },
  };
}
