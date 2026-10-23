export const SEEDED_RULE_ID = "11111111-1111-4111-8111-111111111111";

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS discount_rules (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type = 'PERCENT_OFF_SUBTOTAL'),
  min_subtotal_cents INTEGER NOT NULL CHECK (min_subtotal_cents >= 0),
  percent INTEGER NOT NULL CHECK (percent >= 0 AND percent <= 100),
  active BOOLEAN NOT NULL DEFAULT false,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers (id),
  status TEXT NOT NULL CHECK (status = 'created'),
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents INTEGER NOT NULL CHECK (discount_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'BRL',
  discount_rule_id UUID REFERENCES discount_rules (id),
  discount_rule_name TEXT,
  discount_rule_percent INTEGER CHECK (discount_rule_percent IS NULL OR (discount_rule_percent >= 0 AND discount_rule_percent <= 100)),
  created_at TIMESTAMPTZ NOT NULL,
  CHECK (discount_cents <= subtotal_cents),
  CHECK (total_cents = subtotal_cents - discount_cents)
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders (id),
  sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 999),
  line_total_cents INTEGER NOT NULL CHECK (line_total_cents = unit_price_cents * quantity)
);

CREATE INDEX IF NOT EXISTS order_items_order_id ON order_items (order_id);
CREATE INDEX IF NOT EXISTS orders_created_at_id ON orders (created_at DESC, id DESC);

INSERT INTO discount_rules (id, name, type, min_subtotal_cents, percent, active, valid_from)
VALUES (
  '${SEEDED_RULE_ID}',
  'Pedidos a partir de R$ 200,00 recebem 10%',
  'PERCENT_OFF_SUBTOTAL',
  20000,
  10,
  true,
  '2020-01-01T00:00:00Z'
)
ON CONFLICT (id) DO NOTHING;
`;
