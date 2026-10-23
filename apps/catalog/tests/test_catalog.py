"""Scenarios 1–3 from specs/scenarios.md."""

import asyncio
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.api import create_app
from app.models import Product
from app.repository import MongoProductRepository
from app.seed import FUTURE, PAST

NOW = datetime(2026, 10, 22, tzinfo=timezone.utc)


def sellable(sku: str, name: str, cents: int) -> Product:
    return Product(sku, name, cents, "BRL", PAST, True)


class FakeRepo:
    def __init__(self, products: list[Product]):
        self.products = products
        self.calls = 0
        self.last_skus: list[str] = []

    async def find_priced(self, skus: list[str], now: datetime) -> list[Product]:
        self.calls += 1
        self.last_skus = list(skus)
        by_sku = {product.sku: product for product in self.products if product.is_sellable(now)}
        return [by_sku[sku] for sku in skus if sku in by_sku]


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, length=None):
        return self.docs


class FakeCollection:
    def __init__(self):
        self.finds = []

    def find(self, query, projection=None):
        self.finds.append(query)
        return FakeCursor([])


def test_repository_issues_one_in_query():
    collection = FakeCollection()
    repo = MongoProductRepository(collection)
    asyncio.run(repo.find_priced(["CAD-001", "CAD-002", "CAD-010"], NOW))
    assert len(collection.finds) == 1
    assert collection.finds[0]["sku"] == {"$in": ["CAD-001", "CAD-002", "CAD-010"]}
    assert collection.finds[0]["active"] is True
    assert collection.finds[0]["price.validFrom"] == {"$lte": NOW}


def test_batch_returns_products_and_one_repository_call():
    repo = FakeRepo(
        [
            sellable("CAD-001", "Caderno A4", 2500),
            sellable("CAD-002", "Caneta", 350),
            sellable("CAD-010", "Licença", 250000),
        ]
    )
    client = TestClient(create_app(repo))
    response = client.get("/products", params={"skus": "CAD-001,CAD-002,CAD-010"})
    assert response.status_code == 200
    body = response.json()
    assert [item["sku"] for item in body["products"]] == ["CAD-001", "CAD-002", "CAD-010"]
    assert body["products"][0]["price"]["amountCents"] == 2500
    assert body["missing"] == []
    assert repo.calls == 1
    assert repo.last_skus == ["CAD-001", "CAD-002", "CAD-010"]


def test_inactive_and_future_prices_are_missing():
    repo = FakeRepo(
        [
            sellable("CAD-001", "Caderno A4", 2500),
            Product("CAD-OFF", "Mousepad", 4000, "BRL", PAST, False),
            Product("CAD-FUT", "Cadeira", 80000, "BRL", FUTURE, True),
        ]
    )
    client = TestClient(create_app(repo))
    response = client.get("/products", params={"skus": "CAD-001, CAD-OFF,CAD-FUT"})
    assert response.status_code == 200
    body = response.json()
    assert [item["sku"] for item in body["products"]] == ["CAD-001"]
    assert body["missing"] == ["CAD-OFF", "CAD-FUT"]
    assert repo.calls == 1


def test_empty_sku_query_is_400():
    client = TestClient(create_app(FakeRepo([])))
    response = client.get("/products", params={"skus": " , "})
    assert response.status_code == 400
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_openapi_describes_response_bodies():
    client = TestClient(create_app(FakeRepo([])))
    schema = client.get("/openapi.json").json()
    components = schema["components"]["schemas"]

    def body(path, method, status):
        raw = schema["paths"][path][method]["responses"][status]["content"]["application/json"]["schema"]
        if "$ref" in raw:
            return components[raw["$ref"].rsplit("/", 1)[-1]]
        return raw

    quote = body("/products", "get", "200")
    assert set(quote["properties"]) >= {"products", "missing"}
    product = body("/products/{sku}", "get", "200")
    assert set(product["properties"]) >= {"sku", "name", "price"}
    price_ref = product["properties"]["price"]["$ref"]
    price = components[price_ref.rsplit("/", 1)[-1]]
    assert set(price["properties"]) >= {"amountCents", "currency", "validFrom"}
    error = body("/products", "get", "400")
    assert set(error["properties"]) >= {"code", "message"}
    health = body("/health", "get", "200")
    assert "status" in health["properties"]


def test_root_redirects_to_swagger():
    client = TestClient(create_app(FakeRepo([])))
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/docs"
    docs = client.get("/docs")
    assert docs.status_code == 200
    assert "swagger" in docs.text.lower()


def test_single_product_404_when_not_sellable():
    repo = FakeRepo([Product("CAD-OFF", "Mousepad", 4000, "BRL", PAST, False)])
    client = TestClient(create_app(repo))
    response = client.get("/products/CAD-OFF")
    assert response.status_code == 404
    assert response.json()["code"] == "UNKNOWN_SKU"
