import { buildApp } from "./interfaces/http/app.js";
import { createCatalogClient } from "./infrastructure/http/catalogClient.js";
import { createPool, PostgresStore } from "./infrastructure/postgres/store.js";

const port = Number(process.env.PORT ?? 8080);
const databaseUrl = process.env.DATABASE_URL;
const catalogBaseUrl = process.env.CATALOG_BASE_URL ?? "http://localhost:8081";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const pool = createPool(databaseUrl);
const store = new PostgresStore(pool);
await store.ensureSchema();

const app = buildApp(
  {
    orders: store,
    discounts: store,
    catalog: createCatalogClient(catalogBaseUrl),
    health: async () => {
      await pool.query("SELECT 1");
    },
  },
  { logger: true },
);

const shutdown = async () => {
  await app.close();
  await pool.end();
};

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});

await app.listen({ port, host: "0.0.0.0" });
