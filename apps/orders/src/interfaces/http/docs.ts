import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";

export function resolveOpenApiPath(): string {
  if (process.env.OPENAPI_PATH) return process.env.OPENAPI_PATH;
  const nextToSource = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../specs/orders.openapi.yaml");
  if (existsSync(nextToSource)) return nextToSource;
  return resolve(process.cwd(), "openapi.yaml");
}

/** Serves specs/orders.openapi.yaml at /docs. Registered from main, not from unit tests. */
export async function registerApiDocs(app: FastifyInstance, openapiPath = resolveOpenApiPath()): Promise<void> {
  if (!existsSync(openapiPath)) {
    throw new Error(`OpenAPI spec not found at ${openapiPath}`);
  }
  await app.register(swagger, {
    mode: "static",
    specification: {
      path: openapiPath,
      baseDir: dirname(openapiPath),
    },
  });
  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  });
}
