# Scenarios

Each scenario is one test. Prices are cents of BRL. The seeded rule is 10% off when the subtotal is at least 20000.

## Catalog

1. **Batch lookup.** Asking for three known SKUs returns three products and an empty `missing` list. The repository runs one `find`, and the filter uses `$in`.
2. **Not sellable.** An inactive SKU and a SKU whose price starts in the future are returned in `missing`. They are not in `products`.
3. **Empty query.** No SKU, or more than 50, is HTTP 400 `VALIDATION_ERROR`.

## Orders

1. **Create under the threshold.** Two units of CAD-001 (2500 each) become subtotal 5000, discount 0, total 5000, status `created`, and `discountRule` null. Each line stores the catalog unit price.
2. **Create over the threshold.** One unit of CAD-010 (250000) becomes discount 25000 and total 225000.
3. **Unknown SKU.** The response is 422 `UNKNOWN_SKU`. No order row is written.
4. **Client price.** A body that includes `unitPriceCents` is 400 `VALIDATION_ERROR`. Nothing is written.
5. **One catalog call.** Three lines produce one call to the catalog, with all three SKUs.
6. **Rule is data.** After the active rule percent changes from 10 to 20, the next CAD-010 order discounts 50000. No application code changes. An order already stored keeps the name and percent from the moment it was created.
7. **Below the new threshold.** A 5000 subtotal still discounts 0, with `discountRule` null, while the rule minimum stays 20000.
8. **Catalog down.** A failed catalog call is 503 `CATALOG_UNAVAILABLE`. Nothing is written.
9. **Placeholders.** The INSERT for two lines (seven columns each) contains `$1` and `$8` and fourteen placeholders, and contains no quoted literal.
10. **List.** Newest order first. A cursor returns the following page without repeating the previous ids.
