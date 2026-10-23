import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/interfaces/http/app.js";
import { SEEDED_RULE_ID } from "../src/infrastructure/postgres/schema.js";
import { PostgresStore, createPool } from "../src/infrastructure/postgres/store.js";
import { catalogOf } from "./fakes.js";

const databaseUrl = process.env.DATABASE_URL;
const describeSql = databaseUrl ? describe : describe.skip;

describeSql("postgres", () => {
  let pool: pg.Pool;
  let store: PostgresStore;

  beforeAll(async () => {
    pool = createPool(databaseUrl!);
    store = new PostgresStore(pool);
    await store.ensureSchema();
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE order_items, orders, customers");
    await pool.query(
      `UPDATE discount_rules
       SET name = $2, min_subtotal_cents = 20000, percent = 10, active = true
       WHERE id = $1`,
      [SEEDED_RULE_ID, "Pedidos a partir de R$ 200,00 recebem 10%"],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it("persists a discounted order with parameterized rows", async () => {
    const catalog = catalogOf([
      { sku: "CAD-010", name: "Licença anual de suporte", amountCents: 250_000, currency: "BRL" },
    ]);
    const app = buildApp({ orders: store, discounts: store, catalog });
    const response = await app.inject({
      method: "POST",
      url: "/orders",
      payload: {
        customer: { name: "Grace Hopper", email: "grace@example.com" },
        items: [{ sku: "CAD-010", quantity: 1 }],
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    const rows = await pool.query(
      `SELECT o.subtotal_cents, o.discount_cents, o.total_cents, o.status, i.unit_price_cents, i.sku
       FROM orders o
       JOIN order_items i ON i.order_id = o.id
       WHERE o.id = $1`,
      [body.id],
    );
    expect(rows.rows).toEqual([
      {
        subtotal_cents: 250_000,
        discount_cents: 25_000,
        total_cents: 225_000,
        status: "created",
        unit_price_cents: 250_000,
        sku: "CAD-010",
      },
    ]);
    expect(catalog.calls).toHaveLength(1);

    const again = await app.inject({
      method: "POST",
      url: "/orders",
      payload: {
        customer: { name: "Grace Hopper", email: "grace@example.com" },
        items: [{ sku: "CAD-010", quantity: 1 }],
      },
    });
    expect(again.statusCode).toBe(201);
    const customers = await pool.query("SELECT count(*)::int AS n FROM customers");
    expect(customers.rows[0].n).toBe(1);
    await app.close();
  });

  it("shows the percent copied at creation after the rule changes", async () => {
    const catalog = catalogOf([
      { sku: "CAD-010", name: "Licença anual de suporte", amountCents: 250_000, currency: "BRL" },
    ]);
    const app = buildApp({ orders: store, discounts: store, catalog });
    const created = await app.inject({
      method: "POST",
      url: "/orders",
      payload: {
        customer: { name: "Ada Lovelace", email: "ada@example.com" },
        items: [{ sku: "CAD-010", quantity: 1 }],
      },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;

    const updated = await app.inject({
      method: "PUT",
      url: `/discount-rules/${SEEDED_RULE_ID}`,
      payload: {
        name: "Pedidos a partir de R$ 200,00 recebem 20%",
        minSubtotalCents: 20_000,
        percent: 20,
        active: true,
      },
    });
    expect(updated.statusCode).toBe(200);

    const again = await app.inject({ method: "GET", url: `/orders/${id}` });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({
      discountCents: 25_000,
      totalCents: 225_000,
      discountRule: { name: "Pedidos a partir de R$ 200,00 recebem 10%", percent: 10 },
    });

    const next = await app.inject({
      method: "POST",
      url: "/orders",
      payload: {
        customer: { name: "Ada Lovelace", email: "ada@example.com" },
        items: [{ sku: "CAD-010", quantity: 1 }],
      },
    });
    expect(next.json().discountRule).toMatchObject({ percent: 20 });
    await app.close();
  });
});
