#!/usr/bin/env python3
"""Smoke the two services the way an operator would."""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request

ORDERS = "http://127.0.0.1:18080"
CATALOG = "http://127.0.0.1:8081"
RULE_ID = "11111111-1111-4111-8111-111111111111"


def request(method: str, url: str, body: dict | None = None) -> tuple[int, dict]:
    data = None if body is None else json.dumps(body).encode()
    headers = {"Content-Type": "application/json"} if body is not None else {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def wait_ready() -> None:
    deadline = time.time() + 60
    while time.time() < deadline:
        try:
            orders_status, _ = request("GET", f"{ORDERS}/health")
            catalog_status, _ = request("GET", f"{CATALOG}/health")
            if orders_status == 200 and catalog_status == 200:
                return
        except (urllib.error.URLError, TimeoutError, OSError):
            pass
        time.sleep(1)
    raise SystemExit("serviços não ficaram prontos em 60s")


def expect(condition: bool, detail: str) -> None:
    if not condition:
        raise SystemExit(detail)


def main() -> None:
    wait_ready()
    status, quote = request("GET", f"{CATALOG}/products?skus=CAD-001,CAD-010,CAD-OFF,CAD-FUT")
    expect(status == 200, f"catálogo {status} {quote}")
    prices = {item["sku"]: item["price"]["amountCents"] for item in quote["products"]}
    expect(prices == {"CAD-001": 2500, "CAD-010": 250000}, f"preços {prices}")
    expect(quote["missing"] == ["CAD-OFF", "CAD-FUT"], f"missing {quote['missing']}")

    status, small = request(
        "POST",
        f"{ORDERS}/orders",
        {"customer": {"name": "Ada Lovelace", "email": "ada@example.com"}, "items": [{"sku": "CAD-001", "quantity": 2}]},
    )
    expect(status == 201, f"pedido pequeno {status} {small}")
    expect(small["subtotalCents"] == 5000 and small["discountCents"] == 0 and small["totalCents"] == 5000, str(small))

    status, big = request(
        "POST",
        f"{ORDERS}/orders",
        {"customer": {"name": "Ada Lovelace", "email": "ada@example.com"}, "items": [{"sku": "CAD-010", "quantity": 1}]},
    )
    expect(status == 201, f"pedido grande {status} {big}")
    expect(big["discountCents"] == 25000 and big["totalCents"] == 225000, str(big))
    expect(big["items"][0]["unitPriceCents"] == 250000, str(big["items"]))

    status, fetched = request("GET", f"{ORDERS}/orders/{big['id']}")
    expect(status == 200 and fetched["id"] == big["id"], str(fetched))

    status, missing = request(
        "POST",
        f"{ORDERS}/orders",
        {"customer": {"name": "Ada Lovelace", "email": "ada@example.com"}, "items": [{"sku": "CAD-OFF", "quantity": 1}]},
    )
    expect(status == 422 and missing["code"] == "UNKNOWN_SKU", str(missing))

    status, priced = request(
        "POST",
        f"{ORDERS}/orders",
        {
            "customer": {"name": "Ada Lovelace", "email": "ada@example.com"},
            "items": [{"sku": "CAD-001", "quantity": 1, "unitPriceCents": 1}],
        },
    )
    expect(status == 400 and priced["code"] == "VALIDATION_ERROR", str(priced))

    status, rule = request(
        "PUT",
        f"{ORDERS}/discount-rules/{RULE_ID}",
        {
            "name": "Pedidos a partir de R$ 200,00 recebem 20%",
            "minSubtotalCents": 20000,
            "percent": 20,
            "active": True,
        },
    )
    expect(status == 200 and rule["percent"] == 20, str(rule))

    status, after = request(
        "POST",
        f"{ORDERS}/orders",
        {"customer": {"name": "Ada Lovelace", "email": "ada@example.com"}, "items": [{"sku": "CAD-010", "quantity": 1}]},
    )
    expect(status == 201 and after["discountCents"] == 50000 and after["totalCents"] == 200000, str(after))
    print("demo ok")
    print(f"pedido com 10%: {big['id']} total {big['totalCents']}")
    print(f"pedido com 20%: {after['id']} total {after['totalCents']}")


if __name__ == "__main__":
    main()
