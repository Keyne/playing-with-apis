"""Product as the catalog stores it, and the JSON the API returns."""

from dataclasses import dataclass
from datetime import datetime, timezone

from pydantic import BaseModel, Field


@dataclass(frozen=True)
class Product:
    sku: str
    name: str
    amount_cents: int
    currency: str
    valid_from: datetime
    active: bool

    def is_sellable(self, now: datetime) -> bool:
        return self.active and self.valid_from <= now


def product_from_doc(doc: dict) -> Product:
    price = doc["price"]
    valid_from = price["validFrom"]
    if valid_from.tzinfo is None:
        valid_from = valid_from.replace(tzinfo=timezone.utc)
    return Product(
        sku=doc["sku"],
        name=doc["name"],
        amount_cents=int(price["amountCents"]),
        currency=price["currency"],
        valid_from=valid_from,
        active=bool(doc.get("active", True)),
    )


def product_json(product: Product) -> dict:
    valid_from = product.valid_from.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "sku": product.sku,
        "name": product.name,
        "price": {
            "amountCents": product.amount_cents,
            "currency": product.currency,
            "validFrom": valid_from,
        },
    }


class PriceOut(BaseModel):
    amountCents: int = Field(examples=[2500])
    currency: str = Field(examples=["BRL"])
    validFrom: str = Field(examples=["2020-01-01T00:00:00Z"])


class ProductOut(BaseModel):
    sku: str = Field(examples=["CAD-001"])
    name: str = Field(examples=["Caderno A4"])
    price: PriceOut


class QuoteOut(BaseModel):
    products: list[ProductOut]
    missing: list[str] = Field(examples=[["CAD-OFF"]])


class ErrorOut(BaseModel):
    code: str = Field(examples=["VALIDATION_ERROR"])
    message: str


class HealthOut(BaseModel):
    status: str = Field(examples=["ok"])
