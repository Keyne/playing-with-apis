# Stefanini COE Leader — technical challenge plan

Status: implemented. `python3 scripts/demo.py` passed against Docker Compose. Pedidos is published on host port 18080. `npm ci` runs inside the Node image.

Source: `coe-leader-desenvolvimento-candidatura-desafio-tecnico (1).pdf` (7 pages, Stefanini Group, candidate document). The PDF stays out of git. It is marked confidential.

The panel grades two working services and the judgment around them. The role signal they call out is effective use of AI across the whole cycle, plus the governance guide and the effort estimate. Spec-Driven Development is the method they want to see.

Candidate-facing docs (README, review guide, sizing, ADRs) are in Portuguese. Code, commits, and this plan are in English.

## What must ship

One GitHub repository, GitFlow history, README that runs the project.

**Part 1 — Pedidos (required).** REST API. Relational database (PostgreSQL). Clean Code and Clean Architecture. Endpoints to create, list, and get an order. Each order has customer, items, quantities, subtotal, applied discount, total, and status. Discount rule is configurable, not a constant in code. Persistence uses parameterized queries. Automated tests cover order creation.

**Part 2 — Catálogo (required).** REST API. Non-relational database (MongoDB). One endpoint returns products with the current price. Pedidos calls it when an order is created, to validate the item and the price. Price lookup is one query for the whole order, never one query per line.

**Differentials.**

- An AI pass that suggests and reviews API validations and error messages. The prompt and the check applied to the model output are written down.
- CI (GitHub Actions) runs the tests and blocks anything that would deploy.
- A 1–2 page code-review guide for multi-stack squads, with criteria that block a pull request.
- A technical sizing for delivering Parts 1 and 2 in three weeks with one senior and one mid-level developer: effort, seniority, team shape, and premises.

**Delivery extras.** A document that names the AI tool, why it was chosen, and how it was used from spec through tests. The share link of the working chat is mandatory (addendum on page 4). Guide and sizing live in `/docs`. A short slide deck is desirable, not required. SAI APP 3.0 is a plus. This work is done in Grok. The write-up says that plainly.

## Stack

Monorepo. Two processes, two databases, HTTP between them. No shared database and no shared runtime.

| Piece | Choice | Why |
|---|---|---|
| Pedidos | Node.js, TypeScript, Fastify | Named in the brief. Typed boundaries. Explicit SQL stays visible to the reviewer. |
| SQL | PostgreSQL 16, `pg` driver | Transactions for order + lines. Parameterized queries are in the repository, not hidden. |
| Catálogo | Python 3.12, FastAPI | Second stack on purpose. The review guide then has two real codebases to talk about. |
| Document store | MongoDB 7 | Product is a document. Current price sits on the document. `$in` is one round trip. |
| Run | Docker Compose | Postgres, Mongo, both APIs, seed. One command in the README. |
| Contract | OpenAPI 3 YAML written before the handlers | This is the spec in Spec-Driven Development. |
| Tests | Vitest + Pytest. Postgres service in CI. | Creation of an order is an integration test, not only a unit test. |

No product frontend. The brief does not ask for one. Each service root redirects to Swagger UI (`/docs`): FastAPI's built-in page for Catálogo, and `@fastify/swagger-ui` serving `specs/orders.openapi.yaml` for Pedidos. The demo script remains the scripted walkthrough.

Money is integer cents. Currency is BRL only. No floats.

## Shape of the repo

```
specs/orders.openapi.yaml
specs/catalog.openapi.yaml
specs/scenarios.md
apps/orders/                        # domain, application, ports, postgres, http
apps/catalog/
docs/adr/
docs/code-review-guide.md
docs/proposal-sizing.md
docs/ai-development.md
docs/prompts/error-messages.md
.github/workflows/ci.yml
docker-compose.yml
README.md
```

Orders layout (hexagonal, small):

- `domain` — money, discount, error catalog. No framework imports.
- `application` — create, list, get, update discount rule.
- `ports` — OrderRepository, DiscountRuleRepository, CatalogClient.
- `infrastructure/postgres` — parameterized SQL only.
- `interfaces/http` — Fastify routes and the error mapper.

Catalog is the same idea with fewer ports: one use case, one Mongo adapter, one router.

## Catalog

A product document:

- `sku` (unique index), `name`, `active`
- `price`: `{ amountCents, currency, validFrom }`

Current price is the price whose `validFrom` is at or before now, on an active product. That filter sits inside the single `find`.

Read endpoint, which Pedidos calls:

`GET /products?skus=SKU-1,SKU-2`

Implementation: one `find({ sku: { $in: skus }, active: true, price.validFrom: { $lte: now } })`. Missing SKUs come back in `missing[]` so Pedidos can reject the order without a second query. `GET /products/{sku}` exists for humans and is not used inside the order loop.

Seed: ten sellable products, one inactive, one whose price starts in 2099.

## Orders

Tables: `customers`, `orders`, `order_items`, `discount_rules`.

Status on create is `created`. No update or cancel. The column exists because the brief requires status.

Create flow, one transaction after the catalog call:

1. Parse the body. Client sends customer and lines of `{ sku, quantity }`. A client-sent price is a 400. The catalog is the price source.
2. One catalog call with every SKU.
3. Unknown, inactive, or not-yet-priced SKU → 422, nothing written.
4. Subtotal is the sum of catalog unit price times quantity. The line stores that price, so a later catalog change does not rewrite history.
5. Load the single active discount rule whose window contains now.
6. Apply it. Total is never negative.
7. Insert customer (find-or-create by email), order, and items with bound parameters. Item inserts are one statement. The placeholders are generated from the row count. The values are parameters.

List is `GET /orders?limit=&cursor=`. Get is `GET /orders/{id}` with its items. Items for a page are loaded with `order_id = ANY($1)`, not one query per order.

Discount rule, seeded, not hardcoded:

- Name: orders at or above R$ 200.00 receive 10%.
- Type: `PERCENT_OFF_SUBTOTAL`.
- `min_subtotal_cents = 20000`, `percent = 10`, `active = true`.

`PUT /discount-rules/{id}` changes the row. The use case reads the table on every create and copies the rule name and percent onto the order only when that rule reduced the total. Below the minimum the order stores discount 0 and `discountRule` null. A later edit does not change orders already stored. Activating a rule deactivates the others. Tests cover below-threshold (discount 0, rule null), at-threshold, and a changed percent without a code edit.

## AI validation — which model

This is a development-time review of validations and error messages. `POST /orders` does not call a model. A down model must not take down checkout. CI does not need a key or a GPU.

The script is `scripts/review_error_messages.py`. It sends the prompt in `docs/prompts/error-messages.md` and refuses the answer unless every entry is one of the known codes, the Portuguese message is short, and the text has no SQL, no stack trace, and no echoed customer data.

Two providers, same prompt, same check:

| `AI_PROVIDER` | Where it runs | When to use it |
|---|---|---|
| `xai` (default) | External OpenAI-compatible API, `https://api.x.ai/v1/chat/completions`. Env `XAI_API_KEY` and `XAI_MODEL`. | The submission needs a shareable chat, and the panel can re-run the check without a local GPU. |
| `ollama` | Local Qwen via Ollama, default `http://127.0.0.1:11434`, model `qwen2.5:7b` (`OLLAMA_BASE_URL`, `OLLAMA_MODEL`). | No external key, or the candidate wants the pass on a machine that already serves Qwen. |

The messages shipped in `apps/orders/src/domain/messages.ts` were accepted in this Grok session after that check. The script is how to run the pass again. It prints suggestions. It does not overwrite the catalog unless `--write` is passed, and `--write` still refuses an answer that fails the check.

Not SAI APP 3.0. Not a runtime chatbot.

## Tests that map to the spec

Orders:

- Creates an order and returns subtotal, discount, total, status, and snapshotted prices.
- Rejects an unknown SKU. The repository insert is not called.
- Rejects a body that includes a price.
- Applies 10% only at the threshold. Updating the rule row changes the next order.
- Catalog client is called once for three lines.
- The item INSERT text is built from placeholders (`$1`, `$8`, …) and contains no quoted values. Seven columns and two rows produce `$1` through `$14`.
- With `DATABASE_URL` set, the same create path runs against PostgreSQL.

Catalog:

- The repository issues one `find` whose `sku` operator is `$in`.
- Inactive and future-priced SKUs come back in `missing`.
- Three SKUs still produce one repository call.

## CI and GitFlow

GitHub Actions on pull requests and on pushes to `develop` and `main`:

1. Catalog unit tests on Python 3.12.
2. Orders typecheck, unit tests, and the Postgres integration test.
3. A `package` job builds both images only after those jobs pass.
4. A `release` job runs on a push to `main`, and only after `package`. That is the deploy step. It builds the images a publish would ship. No registry is configured, so it does not push.

Branch story: `main`, `develop`, `feature/*` merged with `--no-ff`, then one release merge `develop` → `main`.

## Leadership documents

`docs/code-review-guide.md` — blocking criteria for both stacks: string-built queries, float money, client prices, a query per line, a use case that imports the framework or the driver, a create-order test that never has a path to Postgres, secrets in the diff, stack traces in the response.

`docs/proposal-sizing.md` — three weeks, one senior and one pleno, Parts 1 and 2 only. Premises: no UI, no auth, no payments, no order updates, one currency, catalog is read-only, Compose on a laptop. Risks: catalog down fails the order with nothing written; there is no quote step; a double submit creates two orders (named as a follow-up).

ADRs, one screen each: service boundary, cents, batch lookup, discount stored as data.

## Out of scope

Authentication, payments, order cancel or update, a UI, Kubernetes, multi-currency, idempotency keys, a runtime model call on the create path.

## Build order

1. Specs, scenarios, ADRs.
2. Catalog, seed, catalog tests.
3. Orders schema, create order, discount rule, tests. Postgres test when a database is available.
4. List and get.
5. Error catalog and the review script.
6. GitHub Actions, Compose, demo script.
7. README, review guide, sizing, AI write-up.
8. Feature branches and the release merge.
