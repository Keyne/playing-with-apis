import { AppError } from "../domain/errors.js";
import { messages } from "../domain/messages.js";
import type { DiscountRule } from "../domain/discount.js";
import type { Order } from "../domain/order.js";
import type { Cursor, DiscountRuleRepository, OrderRepository, RulePatch } from "../ports.js";

export async function listOrders(
  orders: OrderRepository,
  limit: number,
  cursor: Cursor | null,
): Promise<{ orders: Order[]; hasMore: boolean }> {
  return orders.list(limit, cursor);
}

export async function getOrder(orders: OrderRepository, id: string): Promise<Order> {
  const order = await orders.get(id);
  if (order === null) {
    throw new AppError("ORDER_NOT_FOUND", 404, messages.ORDER_NOT_FOUND);
  }
  return order;
}

export async function listDiscountRules(discounts: DiscountRuleRepository): Promise<DiscountRule[]> {
  return discounts.listRules();
}

export async function updateDiscountRule(
  discounts: DiscountRuleRepository,
  id: string,
  patch: RulePatch,
): Promise<DiscountRule> {
  const updated = await discounts.update(id, patch);
  if (updated === null) {
    throw new AppError("DISCOUNT_RULE_NOT_FOUND", 404, messages.DISCOUNT_RULE_NOT_FOUND);
  }
  return updated;
}
