"""Turn a list of SKUs plus the rows the database returned into a quote."""

from app.models import Product, product_json

MAX_SKUS = 50


class SkuQueryError(ValueError):
    pass


def normalize_skus(raw: str) -> list[str]:
    seen: list[str] = []
    for part in raw.split(","):
        sku = part.strip()
        if not sku or sku in seen:
            continue
        if len(sku) > 40:
            raise SkuQueryError("sku")
        seen.append(sku)
    if not seen or len(seen) > MAX_SKUS:
        raise SkuQueryError("range")
    return seen


def quote_products(requested: list[str], found: list[Product]) -> dict:
    by_sku = {product.sku: product for product in found}
    products = []
    missing = []
    for sku in requested:
        product = by_sku.get(sku)
        if product is None:
            missing.append(sku)
        else:
            products.append(product_json(product))
    return {"products": products, "missing": missing}
