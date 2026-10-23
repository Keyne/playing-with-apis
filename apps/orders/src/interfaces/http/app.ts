import Fastify, { type FastifyInstance } from "fastify";
import { ZodError, z } from "zod";
import { createOrder } from "../../application/createOrder.js";
import { getOrder, listDiscountRules, listOrders, updateDiscountRule } from "../../application/queries.js";
import type { DiscountRule } from "../../domain/discount.js";
import { AppError } from "../../domain/errors.js";
import { messages } from "../../domain/messages.js";
import type { Order } from "../../domain/order.js";
import type { CatalogClient, Cursor, DiscountRuleRepository, OrderRepository } from "../../ports.js";

const createBody = z
  .object({
    customer: z
      .object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email().max(200),
      })
      .strict(),
    items: z
      .array(
        z
          .object({
            sku: z.string().trim().min(1).max(40),
            quantity: z.number().int().positive().max(999),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    for (const item of body.items) {
      if (seen.has(item.sku)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items"], message: "sku repetido" });
        return;
      }
      seen.add(item.sku);
    }
  });

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const ruleBody = z
  .object({
    name: z.string().trim().min(1).max(160),
    minSubtotalCents: z.number().int().min(0),
    percent: z.number().int().min(0).max(100),
    active: z.boolean(),
  })
  .strict();

const uuidParam = z.object({
  id: z.string().uuid(),
});

export type AppDeps = {
  orders: OrderRepository;
  discounts: DiscountRuleRepository;
  catalog: CatalogClient;
  now?: () => Date;
  id?: () => string;
  health?: () => Promise<void>;
};

export function buildApp(deps: AppDeps, options?: { logger?: boolean }): FastifyInstance {
  const app = Fastify({ logger: options?.logger ?? false });
  const now = deps.now ?? (() => new Date());

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(errorBody(error.code, error.message, error.details));
    }
    if (error instanceof ZodError) {
      return reply.status(400).send(
        errorBody(
          "VALIDATION_ERROR",
          messages.VALIDATION_ERROR,
          error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        ),
      );
    }
    request.log.error(error);
    return reply.status(500).send(errorBody("INTERNAL", messages.INTERNAL));
  });

  app.get("/health", async () => {
    if (deps.health) await deps.health();
    return { status: "ok" };
  });

  app.post("/orders", async (request, reply) => {
    const body = createBody.parse(request.body);
    const order = await createOrder(body, {
      orders: deps.orders,
      discounts: deps.discounts,
      catalog: deps.catalog,
      now,
      id: deps.id,
    });
    return reply.status(201).send(orderJson(order));
  });

  app.get("/orders", async (request) => {
    const query = listQuery.parse(request.query);
    const page = await listOrders(deps.orders, query.limit, decodeCursor(query.cursor));
    const last = page.orders[page.orders.length - 1];
    return {
      orders: page.orders.map(orderJson),
      nextCursor: page.hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  });

  app.get("/orders/:id", async (request) => {
    const { id } = uuidParam.parse(request.params);
    return orderJson(await getOrder(deps.orders, id));
  });

  app.get("/discount-rules", async () => ({
    rules: (await listDiscountRules(deps.discounts)).map(ruleJson),
  }));

  app.put("/discount-rules/:id", async (request) => {
    const { id } = uuidParam.parse(request.params);
    const patch = ruleBody.parse(request.body);
    return ruleJson(await updateDiscountRule(deps.discounts, id, patch));
  });

  return app;
}

function errorBody(code: string, message: string, details?: unknown) {
  return details === undefined ? { code, message } : { code, message, details };
}

function orderJson(order: Order) {
  return {
    id: order.id,
    customer: order.customer,
    items: order.items,
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    totalCents: order.totalCents,
    currency: order.currency,
    status: order.status,
    discountRule: order.discountRule,
    createdAt: order.createdAt.toISOString(),
  };
}

function ruleJson(rule: DiscountRule) {
  return {
    id: rule.id,
    name: rule.name,
    minSubtotalCents: rule.minSubtotalCents,
    percent: rule.percent,
    active: rule.active,
  };
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

export function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null;
  const decoded = Buffer.from(value, "base64url").toString("utf8");
  const splitAt = decoded.lastIndexOf("|");
  if (splitAt <= 0) {
    throw new AppError("VALIDATION_ERROR", 400, messages.VALIDATION_ERROR);
  }
  const createdAt = new Date(decoded.slice(0, splitAt));
  const id = decoded.slice(splitAt + 1);
  if (Number.isNaN(createdAt.getTime()) || !z.string().uuid().safeParse(id).success) {
    throw new AppError("VALIDATION_ERROR", 400, messages.VALIDATION_ERROR);
  }
  return { createdAt, id };
}
