const ITEM_COLUMNS = [
  "id",
  "order_id",
  "sku",
  "product_name",
  "unit_price_cents",
  "quantity",
  "line_total_cents",
] as const;

/**
 * One INSERT for every line. Placeholders are numbered from the row count.
 * Values are bound later and never concatenated into this string.
 */
export function orderItemsInsert(rowCount: number): string {
  if (!Number.isInteger(rowCount) || rowCount < 1) {
    throw new Error("order item insert needs at least one row");
  }
  const width = ITEM_COLUMNS.length;
  const tuples: string[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    const slots: string[] = [];
    for (let column = 0; column < width; column += 1) {
      slots.push(`$${row * width + column + 1}`);
    }
    tuples.push(`(${slots.join(", ")})`);
  }
  return `INSERT INTO order_items (${ITEM_COLUMNS.join(", ")}) VALUES ${tuples.join(", ")}`;
}
