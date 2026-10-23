"""HTTP adapter. The route calls the repository once."""

from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse

from app.quoting import SkuQueryError, normalize_skus, quote_products
from app.models import ErrorOut, HealthOut, ProductOut, QuoteOut, product_json

VALIDATION_MESSAGE = "Informe de 1 a 50 SKUs, separados por vírgula."
UNKNOWN_MESSAGE = "Produto sem preço vigente."


@asynccontextmanager
async def lifespan(app: FastAPI):
    repo = app.state.repo
    ensure = getattr(repo, "ensure_ready", None)
    if ensure is not None:
        await ensure()
    yield
    close = getattr(repo, "close", None)
    if close is not None:
        await close()


def create_app(repo=None) -> FastAPI:
    if repo is None:
        from app.repository import MongoProductRepository

        repo = MongoProductRepository.from_env()

    app = FastAPI(title="Catálogo", version="1.0.0", lifespan=lifespan)
    app.state.repo = repo

    @app.get("/", include_in_schema=False)
    async def root():
        return RedirectResponse(url="/docs")

    @app.get("/health", response_model=HealthOut)
    async def health():
        return {"status": "ok"}

    @app.get("/products", response_model=QuoteOut, responses={400: {"model": ErrorOut}})
    async def quote(request: Request, skus: str = ""):
        try:
            wanted = normalize_skus(skus)
        except SkuQueryError:
            return JSONResponse(
                status_code=400,
                content={"code": "VALIDATION_ERROR", "message": VALIDATION_MESSAGE},
            )
        now = datetime.now(timezone.utc)
        found = await request.app.state.repo.find_priced(wanted, now)
        return quote_products(wanted, found)

    @app.get(
        "/products/{sku}",
        response_model=ProductOut,
        responses={404: {"model": ErrorOut}},
    )
    async def one(sku: str, request: Request):
        now = datetime.now(timezone.utc)
        found = await request.app.state.repo.find_priced([sku], now)
        if not found:
            return JSONResponse(
                status_code=404,
                content={"code": "UNKNOWN_SKU", "message": UNKNOWN_MESSAGE},
            )
        return product_json(found[0])

    return app
