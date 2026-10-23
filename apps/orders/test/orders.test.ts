import { describe, expect, it } from "vitest";
import { discountCents } from "../src/domain/discount.js";
import { messages } from "../src/domain/messages.js";
import { buildApp } from "../src/interfaces/http/app.js";
import { createCatalogClient } from "../src/infrastructure/http/catalogClient.js";
import { orderItemsInsert } from "../src/infrastructure/postgres/sql.js";
import type { CatalogProduct } from "../src/ports.js";
import { catalogOf, memoryStore, tenPercentRule } from "./fakes.js";

const notebook: CatalogProduct = {
  sku: "CAD-010",
  name: "Licença anual de suporte",
  amountCents: 250_000,
  currency: "BRL",
};
const notebookPad: CatalogProduct = {
  sku: "CAD-001",
  name: "Caderno A4",
  amountCents: 2_500,
  currency: "BRL",
};

function appWith(products: CatalogProduct[], ids: string[]) {
  const store = memoryStore([tenPercentRule()]);
  let index = 0;
  let tick = Date.parse("2026-10-22T12:00:00.000Z");
  const catalog = catalogOf(products);
  const app = buildApp({
    orders: store.orders,
    discounts: store.discounts,
    catalog,
    now: () => new Date(tick),
    id: () => ids[index++] ?? "00000000-0000-4000-8000-000000000099",
  });
  return {
    app,
    catalog,
    store,
    advance: (ms = 1000) => {
      tick += ms;
    },
  };
}

const ada = { name: "Ada Lovelace", email: "Ada@Example.com" };

describe("create order", () => {
  it("keeps a small order under the threshold and snapshots the catalog price", async () => {
    const { app, catalog } = appWith([notebookPad, notebook], ["00000000-0000-4000-8000-000000000001"]);
    const response = await app.inject({
      method: "POST",
      url: "/orders",
      payload: { customer: ada, items: [{ sku: "CAD-001", quantity: 2 }] },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.subtotalCents).toBe(5_000);
    expect(body.discountCents).toBe(0);
    expect(body.totalCents).toBe(5_000);
    expect(body.status).toBe("created");
    expect(body.currency).toBe("BRL");
    expect(body.customer.email).toBe("ada@example.com");
    expect(body.items[0]).toMatchObject({ sku: "CAD-001", unitPriceCents: 2_500, lineTotalCents: 5_000 });
    expect(body.discountRule).toBeNull();
    expect(catalog.calls).toEqual([["CAD-001"]]);
  });

  it("applies 10 percent once the subtotal reaches R$ 200", async () => {
    const { app } = appWith([notebook], ["00000000-0000-4000-8000-000000000002"]);
    const response = await app.inject({
      method: "POST",
      url: "/orders",
      payload: { customer: ada, items: [{ sku: "CAD-010", quantity: 1 }] },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ subtotalCents: 250_000, discountCents: 25_000, totalCents: 225_000 });
  });

  it("does not write an order when a sku has no current price", async () => {
    const { app, store } = appWith([notebookPad], ["00000000-0000-4000-8000-000000000003"]);
    const response = await app.inject({
      method: "POST",
      url: "/orders",
      payload: { customer: ada, items: [{ sku: "CAD-OFF", quantity: 1 }] },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe("UNKNOWN_SKU");
    expect(store.insertCount()).toBe(0);
  });

  it("rejects a client-sent price", async () => {
    const { app, store } = appWith([notebookPad], ["00000000-0000-4000-8000-000000000004"]);
    const response = await app.inject({
      method: "POST",
      url: "/orders",
      payload: {
        customer: ada,
        items: [{ sku: "CAD-001", quantity: 1, unitPriceCents: 1 }],
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("VALIDATION_ERROR");
    expect(store.insertCount()).toBe(0);
  });

  it("asks the catalog once for three lines", async () => {
    const mouse: CatalogProduct = { sku: "CAD-003", name: "Mouse sem fio", amountCents: 8_900, currency: "BRL" };
    const { app, catalog } = appWith(
      [notebookPad, mouse, notebook],
      ["00000000-0000-4000-8000-000000000005"],
    );
    const response = await app.inject({
      method: "POST",
      url: "/orders",
      payload: {
        customer: ada,
        items: [
          { sku: "CAD-001", quantity: 1 },
          { sku: "CAD-003", quantity: 1 },
          { sku: "CAD-010", quantity: 1 },
        ],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(catalog.calls).toHaveLength(1);
    expect(catalog.calls[0]).toEqual(["CAD-001", "CAD-003", "CAD-010"]);
  });

  it("follows the discount row after it changes", async () => {
    const { app } = appWith([notebook, notebookPad], ["00000000-0000-4000-8000-000000000006"]);
    const updated = await app.inject({
      method: "PUT",
      url: "/discount-rules/11111111-1111-4111-8111-111111111111",
      payload: {
        name: "Pedidos a partir de R$ 200,00 recebem 20%",
        minSubtotalCents: 20_000,
        percent: 20,
        active: true,
      },
    });
    expect(updated.statusCode).toBe(200);
    const response = await app.inject({
      method: "POST",
      url: "/orders",
      payload: { customer: ada, items: [{ sku: "CAD-010", quantity: 1 }] },
    });
    expect(response.json()).toMatchObject({ discountCents: 50_000, totalCents: 200_000 });

    const small = await app.inject({
      method: "POST",
      url: "/orders",
      payload: { customer: ada, items: [{ sku: "CAD-001", quantity: 2 }] },
    });
    expect(small.json()).toMatchObject({
      subtotalCents: 5_000,
      discountCents: 0,
      totalCents: 5_000,
      discountRule: null,
    });
  });

  it("keeps the name and percent copied onto the order", async () => {
    const { app } = appWith([notebook], ["00000000-0000-4000-8000-000000000007"]);
    const created = await app.inject({
      method: "POST",
      url: "/orders",
      payload: { customer: ada, items: [{ sku: "CAD-010", quantity: 1 }] },
    });
    const id = created.json().id as string;
    expect(created.json().discountRule).toMatchObject({
      name: "Pedidos a partir de R$ 200,00 recebem 10%",
      percent: 10,
    });
    const updated = await app.inject({
      method: "PUT",
      url: "/discount-rules/11111111-1111-4111-8111-111111111111",
      payload: {
        name: "Pedidos a partir de R$ 200,00 recebem 20%",
        minSubtotalCents: 20_000,
        percent: 20,
        active: true,
      },
    });
    expect(updated.statusCode).toBe(200);
    const again = await app.inject({ method: "GET", url: `/orders/${id}` });
    expect(again.json().discountCents).toBe(25_000);
    expect(again.json().discountRule).toMatchObject({
      name: "Pedidos a partir de R$ 200,00 recebem 10%",
      percent: 10,
    });
  });

  it("stores nothing when the catalog is down", async () => {
    const store = memoryStore([tenPercentRule()]);
    const app = buildApp({
      orders: store.orders,
      discounts: store.discounts,
      catalog: { async getPrices() { throw new Error("connection refused"); } },
    });
    const response = await app.inject({
      method: "POST",
      url: "/orders",
      payload: { customer: ada, items: [{ sku: "CAD-001", quantity: 1 }] },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe("CATALOG_UNAVAILABLE");
    expect(response.json().message).not.toMatch(/connection refused|select /i);
    expect(store.insertCount()).toBe(0);
  });
});

describe("list", () => {
  it("returns the newest page and then the rest", async () => {
    const ids = [
      "00000000-0000-4000-8000-00000000000a",
      "00000000-0000-4000-8000-00000000000b",
      "00000000-0000-4000-8000-00000000000c",
    ];
    const harness = appWith([notebookPad], ids);
    for (const id of ids) {
      const response = await harness.app.inject({
        method: "POST",
        url: "/orders",
        payload: { customer: { name: id, email: `${id}@example.com` }, items: [{ sku: "CAD-001", quantity: 1 }] },
      });
      expect(response.statusCode).toBe(201);
      harness.advance();
    }
    const first = await harness.app.inject({ method: "GET", url: "/orders?limit=2" });
    const page = first.json();
    expect(page.orders.map((order: { id: string }) => order.id)).toEqual([ids[2], ids[1]]);
    expect(page.nextCursor).toBeTruthy();
    const second = await harness.app.inject({
      method: "GET",
      url: `/orders?limit=2&cursor=${encodeURIComponent(page.nextCursor)}`,
    });
    expect(second.json().orders.map((order: { id: string }) => order.id)).toEqual([ids[0]]);
    expect(second.json().nextCursor).toBeNull();
  });
});

describe("query errors", () => {
  it("does not call a bad limit invalid order data", async () => {
    const { app } = appWith([], []);
    const response = await app.inject({ method: "GET", url: "/orders?limit=0" });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("VALIDATION_ERROR");
    expect(response.json().message).toBe(messages.INVALID_QUERY);
  });

  it("does not call a bad id invalid order data", async () => {
    const { app } = appWith([], []);
    const response = await app.inject({ method: "GET", url: "/orders/not-a-uuid" });
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe(messages.INVALID_QUERY);
  });
});

describe("docs", () => {
  it("sends the browser from / to /docs", async () => {
    const { app } = appWith([], []);
    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("/docs");
  });
});

describe("sql", () => {
  it("builds one insert of placeholders and no quoted values", () => {
    const text = orderItemsInsert(2);
    expect(text.startsWith("INSERT INTO order_items")).toBe(true);
    expect(text).toContain("$1");
    expect(text).toContain("$8");
    expect(text).not.toContain("'");
    expect(text.match(/\$/g)).toHaveLength(14);
  });

  it("rounds percent discount down to cents", () => {
    const rule = tenPercentRule();
    const now = new Date("2026-10-22T00:00:00.000Z");
    expect(discountCents(19_999, rule, now)).toBe(0);
    expect(discountCents(20_000, rule, now)).toBe(2_000);
    expect(discountCents(19_999, { ...rule, minSubtotalCents: 0 }, now)).toBe(1_999);
  });
});

describe("catalog client", () => {
  it("requests every sku on a single url", async () => {
    const seen: string[] = [];
    const client = createCatalogClient("http://catalog:8081", async (input) => {
      seen.push(String(input));
      return new Response(JSON.stringify({ products: [], missing: ["CAD-001", "CAD-010"] }), { status: 200 });
    });
    const quoted = await client.getPrices(["CAD-001", "CAD-010"]);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("skus=CAD-001%2CCAD-010");
    expect(quoted.missing).toEqual(["CAD-001", "CAD-010"]);
  });

  it("reads the nested catalog price", async () => {
    const client = createCatalogClient("http://catalog:8081", async () => {
      return new Response(
        JSON.stringify({
          products: [
            {
              sku: "CAD-010",
              name: "Licença anual de suporte",
              price: { amountCents: 250_000, currency: "BRL", validFrom: "2020-01-01T00:00:00Z" },
            },
          ],
          missing: [],
        }),
        { status: 200 },
      );
    });
    const quoted = await client.getPrices(["CAD-010"]);
    expect(quoted.products).toEqual([
      { sku: "CAD-010", name: "Licença anual de suporte", amountCents: 250_000, currency: "BRL" },
    ]);
  });
});
