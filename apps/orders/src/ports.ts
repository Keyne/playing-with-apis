import type { DiscountRule } from "./domain/discount.js";
import type { NewOrder, Order } from "./domain/order.js";

export type CatalogProduct = {
  sku: string;
  name: string;
  amountCents: number;
  currency: string;
};

export type PriceList = {
  products: CatalogProduct[];
  missing: string[];
};

export type CatalogClient = {
  getPrices(skus: string[]): Promise<PriceList>;
};

export type Cursor = {
  createdAt: Date;
  id: string;
};

export type OrderPage = {
  orders: Order[];
  hasMore: boolean;
};

export type OrderRepository = {
  insert(order: NewOrder): Promise<Order>;
  list(limit: number, cursor: Cursor | null): Promise<OrderPage>;
  get(id: string): Promise<Order | null>;
};

export type RulePatch = {
  name: string;
  minSubtotalCents: number;
  percent: number;
  active: boolean;
};

export type DiscountRuleRepository = {
  findActive(now: Date): Promise<DiscountRule | null>;
  listRules(): Promise<DiscountRule[]>;
  update(id: string, patch: RulePatch): Promise<DiscountRule | null>;
};
