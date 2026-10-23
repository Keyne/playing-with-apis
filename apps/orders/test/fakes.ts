import { randomUUID } from "node:crypto";
import type { DiscountRule } from "../src/domain/discount.js";
import type { NewOrder, Order } from "../src/domain/order.js";
import type {
  CatalogClient,
  CatalogProduct,
  Cursor,
  DiscountRuleRepository,
  OrderPage,
  OrderRepository,
  RulePatch,
} from "../src/ports.js";

export function catalogOf(products: CatalogProduct[]): CatalogClient & { calls: string[][] } {
  const calls: string[][] = [];
  const bySku = new Map(products.map((product) => [product.sku, product]));
  return {
    calls,
    async getPrices(skus: string[]) {
      calls.push([...skus]);
      return {
        products: skus.flatMap((sku) => {
          const product = bySku.get(sku);
          return product ? [product] : [];
        }),
        missing: skus.filter((sku) => !bySku.has(sku)),
      };
    },
  };
}

export function memoryStore(seedRules: DiscountRule[]): {
  orders: OrderRepository;
  discounts: DiscountRuleRepository;
  insertCount: () => number;
} {
  const saved: Order[] = [];
  const customers = new Map<string, { id: string; name: string; email: string }>();
  let rules = seedRules.map((rule) => ({ ...rule }));
  let inserts = 0;

  const orders: OrderRepository = {
    async insert(order: NewOrder): Promise<Order> {
      inserts += 1;
      const existing = customers.get(order.customer.email);
      const customer = existing ?? { id: randomUUID(), ...order.customer };
      if (!existing) customers.set(order.customer.email, customer);
      else customer.name = order.customer.name;
      const stored: Order = { ...order, customer: { ...customer }, items: order.items.map((item) => ({ ...item })) };
      saved.push(stored);
      return stored;
    },
    async list(limit: number, cursor: Cursor | null): Promise<OrderPage> {
      const sorted = [...saved].sort((a, b) => {
        const byTime = b.createdAt.getTime() - a.createdAt.getTime();
        if (byTime !== 0) return byTime;
        return a.id < b.id ? 1 : -1;
      });
      const filtered = cursor
        ? sorted.filter(
            (order) =>
              order.createdAt < cursor.createdAt ||
              (order.createdAt.getTime() === cursor.createdAt.getTime() && order.id < cursor.id),
          )
        : sorted;
      const page = filtered.slice(0, limit + 1);
      return { orders: page.slice(0, limit), hasMore: page.length > limit };
    },
    async get(id: string): Promise<Order | null> {
      return saved.find((order) => order.id === id) ?? null;
    },
  };

  const discounts: DiscountRuleRepository = {
    async findActive(now: Date): Promise<DiscountRule | null> {
      const open = rules.filter(
        (rule) => rule.active && rule.validFrom <= now && (rule.validTo === null || rule.validTo > now),
      );
      open.sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime());
      return open[0] ? { ...open[0] } : null;
    },
    async listRules(): Promise<DiscountRule[]> {
      return rules.map((rule) => ({ ...rule }));
    },
    async update(id: string, patch: RulePatch): Promise<DiscountRule | null> {
      const rule = rules.find((item) => item.id === id);
      if (!rule) return null;
      if (patch.active) {
        for (const other of rules) {
          if (other.id !== id) other.active = false;
        }
      }
      rule.name = patch.name;
      rule.minSubtotalCents = patch.minSubtotalCents;
      rule.percent = patch.percent;
      rule.active = patch.active;
      return { ...rule };
    },
  };

  return { orders, discounts, insertCount: () => inserts };
}

export function tenPercentRule(): DiscountRule {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Pedidos a partir de R$ 200,00 recebem 10%",
    type: "PERCENT_OFF_SUBTOTAL",
    minSubtotalCents: 20_000,
    percent: 10,
    active: true,
    validFrom: new Date("2020-01-01T00:00:00.000Z"),
    validTo: null,
  };
}
