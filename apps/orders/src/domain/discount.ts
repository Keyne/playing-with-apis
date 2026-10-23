export type DiscountRule = {
  id: string;
  name: string;
  type: "PERCENT_OFF_SUBTOTAL";
  minSubtotalCents: number;
  percent: number;
  active: boolean;
  validFrom: Date;
  validTo: Date | null;
};

export function ruleIsOpen(rule: DiscountRule, now: Date): boolean {
  if (!rule.active || rule.type !== "PERCENT_OFF_SUBTOTAL") return false;
  if (rule.validFrom > now) return false;
  if (rule.validTo !== null && rule.validTo <= now) return false;
  return true;
}

/** Integer cents. 10% of 19999 is 1999. Percent 100 discounts the whole subtotal. */
export function discountCents(subtotalCents: number, rule: DiscountRule | null, now: Date): number {
  if (rule === null || !ruleIsOpen(rule, now)) return 0;
  if (subtotalCents < rule.minSubtotalCents) return 0;
  return Math.floor((subtotalCents * rule.percent) / 100);
}
