import { randomUUID } from "node:crypto";
import { discountCents } from "../domain/discount.js";
import { AppError } from "../domain/errors.js";
import { messages } from "../domain/messages.js";
import type { CustomerInput, LineInput, Order } from "../domain/order.js";
import type { CatalogClient, DiscountRuleRepository, OrderRepository } from "../ports.js";

const MAX_UNIT_PRICE_CENTS = 100_000_000;

export type CreateOrderCommand = {
  customer: CustomerInput;
  items: LineInput[];
};

export type CreateOrderDeps = {
  orders: OrderRepository;
  discounts: DiscountRuleRepository;
  catalog: CatalogClient;
  now: () => Date;
  id?: () => string;
};

export async function createOrder(command: CreateOrderCommand, deps: CreateOrderDeps): Promise<Order> {
  const skus = command.items.map((item) => item.sku);
  let prices;
  try {
    prices = await deps.catalog.getPrices(skus);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("CATALOG_UNAVAILABLE", 503, messages.CATALOG_UNAVAILABLE);
  }

  if (prices.missing.length > 0) {
    throw new AppError("UNKNOWN_SKU", 422, messages.UNKNOWN_SKU, { skus: prices.missing });
  }

  const bySku = new Map(prices.products.map((product) => [product.sku, product]));
  const absent = skus.filter((sku) => !bySku.has(sku));
  if (absent.length > 0) {
    throw new AppError("UNKNOWN_SKU", 422, messages.UNKNOWN_SKU, { skus: absent });
  }

  const items = command.items.map((item) => {
    const product = bySku.get(item.sku)!;
    if (
      product.currency !== "BRL" ||
      !Number.isInteger(product.amountCents) ||
      product.amountCents < 0 ||
      product.amountCents > MAX_UNIT_PRICE_CENTS
    ) {
      throw new AppError("CATALOG_UNAVAILABLE", 503, messages.CATALOG_UNAVAILABLE);
    }
    const lineTotalCents = product.amountCents * item.quantity;
    return {
      sku: product.sku,
      productName: product.name,
      unitPriceCents: product.amountCents,
      quantity: item.quantity,
      lineTotalCents,
    };
  });

  const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const now = deps.now();
  const rule = await deps.discounts.findActive(now);
  const off = discountCents(subtotalCents, rule, now);
  const nextId = deps.id ?? randomUUID;

  return deps.orders.insert({
    id: nextId(),
    customer: {
      name: command.customer.name.trim(),
      email: command.customer.email.trim().toLowerCase(),
    },
    items,
    subtotalCents,
    discountCents: off,
    totalCents: subtotalCents - off,
    currency: "BRL",
    status: "created",
    discountRule: rule === null ? null : { id: rule.id, name: rule.name, percent: rule.percent },
    createdAt: now,
  });
}
