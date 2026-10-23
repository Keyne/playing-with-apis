export type CustomerInput = {
  name: string;
  email: string;
};

export type LineInput = {
  sku: string;
  quantity: number;
};

export type OrderItem = {
  sku: string;
  productName: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
};

export type StoredCustomer = {
  id: string;
  name: string;
  email: string;
};

export type DiscountRef = {
  id: string;
  name: string;
  percent: number;
};

export type Order = {
  id: string;
  customer: StoredCustomer;
  items: OrderItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  currency: "BRL";
  status: "created";
  discountRule: DiscountRef | null;
  createdAt: Date;
};

export type NewOrder = {
  id: string;
  customer: CustomerInput;
  items: OrderItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  currency: "BRL";
  status: "created";
  discountRule: DiscountRef | null;
  createdAt: Date;
};
