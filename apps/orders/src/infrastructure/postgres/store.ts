import { randomUUID } from "node:crypto";
import pg from "pg";
import type { DiscountRule } from "../../domain/discount.js";
import type { NewOrder, Order, OrderItem, StoredCustomer } from "../../domain/order.js";
import type { Cursor, OrderPage, RulePatch } from "../../ports.js";
import { SCHEMA_SQL } from "./schema.js";
import { orderItemsInsert } from "./sql.js";

type OrderRow = {
  id: string;
  status: "created";
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  currency: "BRL";
  discount_rule_id: string | null;
  discount_rule_name: string | null;
  discount_rule_percent: number | null;
  created_at: Date;
  customer_id: string;
  customer_name: string;
  customer_email: string;
};

type ItemRow = {
  order_id: string;
  sku: string;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
};

type RuleRow = {
  id: string;
  name: string;
  type: "PERCENT_OFF_SUBTOTAL";
  min_subtotal_cents: number;
  percent: number;
  active: boolean;
  valid_from: Date;
  valid_to: Date | null;
};

const ORDER_SELECT = `
  SELECT o.id, o.status, o.subtotal_cents, o.discount_cents, o.total_cents, o.currency,
         o.discount_rule_id, o.created_at,
         r.name AS discount_rule_name, r.percent AS discount_rule_percent,
         c.id AS customer_id, c.name AS customer_name, c.email AS customer_email
  FROM orders o
  JOIN customers c ON c.id = o.customer_id
  LEFT JOIN discount_rules r ON r.id = o.discount_rule_id
`;

export class PostgresStore {
  constructor(private readonly pool: pg.Pool) {}

  async ensureSchema(): Promise<void> {
    await this.pool.query(SCHEMA_SQL);
  }

  async insert(order: NewOrder): Promise<Order> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const customerResult = await client.query<{ id: string; name: string; email: string }>(
        `INSERT INTO customers (id, name, email)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
         RETURNING id, name, email`,
        [randomUUID(), order.customer.name, order.customer.email],
      );
      const customer = customerResult.rows[0];
      if (!customer) throw new Error("customer insert returned no row");

      await client.query(
        `INSERT INTO orders (
           id, customer_id, status, subtotal_cents, discount_cents, total_cents,
           currency, discount_rule_id, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          order.id,
          customer.id,
          order.status,
          order.subtotalCents,
          order.discountCents,
          order.totalCents,
          order.currency,
          order.discountRule?.id ?? null,
          order.createdAt,
        ],
      );

      const params: unknown[] = [];
      for (const item of order.items) {
        params.push(
          randomUUID(),
          order.id,
          item.sku,
          item.productName,
          item.unitPriceCents,
          item.quantity,
          item.lineTotalCents,
        );
      }
      await client.query(orderItemsInsert(order.items.length), params);
      await client.query("COMMIT");
      return {
        ...order,
        customer: { id: customer.id, name: customer.name, email: customer.email },
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async list(limit: number, cursor: Cursor | null): Promise<OrderPage> {
    const result = await this.pool.query<OrderRow>(
      `${ORDER_SELECT}
       WHERE (
         $1::timestamptz IS NULL
         OR o.created_at < $1::timestamptz
         OR (o.created_at = $1::timestamptz AND o.id < $2::uuid)
       )
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT $3`,
      [cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1],
    );
    const hasMore = result.rows.length > limit;
    const page = result.rows.slice(0, limit);
    const items = await this.itemsFor(page.map((row) => row.id));
    return {
      orders: page.map((row) => mapOrder(row, items.get(row.id) ?? [])),
      hasMore,
    };
  }

  async get(id: string): Promise<Order | null> {
    const result = await this.pool.query<OrderRow>(`${ORDER_SELECT} WHERE o.id = $1`, [id]);
    const row = result.rows[0];
    if (!row) return null;
    const items = await this.itemsFor([row.id]);
    return mapOrder(row, items.get(row.id) ?? []);
  }

  async findActive(now: Date): Promise<DiscountRule | null> {
    const result = await this.pool.query<RuleRow>(
      `SELECT id, name, type, min_subtotal_cents, percent, active, valid_from, valid_to
       FROM discount_rules
       WHERE active = true
         AND valid_from <= $1
         AND (valid_to IS NULL OR valid_to > $1)
       ORDER BY valid_from DESC
       LIMIT 1`,
      [now],
    );
    const row = result.rows[0];
    return row ? mapRule(row) : null;
  }

  async listRules(): Promise<DiscountRule[]> {
    const result = await this.pool.query<RuleRow>(
      `SELECT id, name, type, min_subtotal_cents, percent, active, valid_from, valid_to
       FROM discount_rules
       ORDER BY valid_from DESC, name`,
    );
    return result.rows.map(mapRule);
  }

  async update(id: string, patch: RulePatch): Promise<DiscountRule | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (patch.active) {
        await client.query(`UPDATE discount_rules SET active = false WHERE id <> $1 AND active = true`, [id]);
      }
      const result = await client.query<RuleRow>(
        `UPDATE discount_rules
         SET name = $2, min_subtotal_cents = $3, percent = $4, active = $5
         WHERE id = $1
         RETURNING id, name, type, min_subtotal_cents, percent, active, valid_from, valid_to`,
        [id, patch.name, patch.minSubtotalCents, patch.percent, patch.active],
      );
      if (result.rowCount === 0) {
        await client.query("ROLLBACK");
        return null;
      }
      await client.query("COMMIT");
      return mapRule(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async itemsFor(orderIds: string[]): Promise<Map<string, OrderItem[]>> {
    const grouped = new Map<string, OrderItem[]>();
    if (orderIds.length === 0) return grouped;
    const result = await this.pool.query<ItemRow>(
      `SELECT order_id, sku, product_name, unit_price_cents, quantity, line_total_cents
       FROM order_items
       WHERE order_id = ANY($1::uuid[])
       ORDER BY sku`,
      [orderIds],
    );
    for (const row of result.rows) {
      const list = grouped.get(row.order_id) ?? [];
      list.push({
        sku: row.sku,
        productName: row.product_name,
        unitPriceCents: row.unit_price_cents,
        quantity: row.quantity,
        lineTotalCents: row.line_total_cents,
      });
      grouped.set(row.order_id, list);
    }
    return grouped;
  }
}

function mapOrder(row: OrderRow, items: OrderItem[]): Order {
  const customer: StoredCustomer = {
    id: row.customer_id,
    name: row.customer_name,
    email: row.customer_email,
  };
  return {
    id: row.id,
    customer,
    items,
    subtotalCents: row.subtotal_cents,
    discountCents: row.discount_cents,
    totalCents: row.total_cents,
    currency: "BRL",
    status: "created",
    discountRule:
      row.discount_rule_id === null || row.discount_rule_name === null || row.discount_rule_percent === null
        ? null
        : {
            id: row.discount_rule_id,
            name: row.discount_rule_name,
            percent: row.discount_rule_percent,
          },
    createdAt: row.created_at,
  };
}

function mapRule(row: RuleRow): DiscountRule {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    minSubtotalCents: row.min_subtotal_cents,
    percent: row.percent,
    active: row.active,
    validFrom: row.valid_from,
    validTo: row.valid_to,
  };
}

export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl });
}
