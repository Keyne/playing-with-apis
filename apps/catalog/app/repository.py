"""One Mongo find for every SKU in the order. Motor is imported only here."""

import os
from datetime import datetime

from app.models import Product, product_from_doc
from app.seed import seed_documents


class MongoProductRepository:
    def __init__(self, collection, client=None):
        self._collection = collection
        self._client = client

    @classmethod
    def from_env(cls) -> "MongoProductRepository":
        from motor.motor_asyncio import AsyncIOMotorClient

        url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("MONGO_DB", "catalog")
        client = AsyncIOMotorClient(url)
        return cls(client[db_name].products, client)

    async def find_priced(self, skus: list[str], now: datetime) -> list[Product]:
        # One filter for the whole order. Do not call find inside a loop.
        query = {
            "sku": {"$in": skus},
            "active": True,
            "price.validFrom": {"$lte": now},
        }
        cursor = self._collection.find(query, {"_id": 0, "sku": 1, "name": 1, "active": 1, "price": 1})
        docs = await cursor.to_list(length=max(len(skus), 1))
        return [product_from_doc(doc) for doc in docs]

    async def ensure_ready(self) -> None:
        await self._collection.create_index("sku", unique=True)
        if await self._collection.count_documents({}) == 0:
            await self._collection.insert_many(seed_documents())

    async def close(self) -> None:
        if self._client is not None:
            self._client.close()
