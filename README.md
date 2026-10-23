# Pedidos e Catálogo

Duas APIs para o desafio de COE Leader — Desenvolvimento. Pedidos grava o pedido em PostgreSQL. Catálogo responde o preço vigente a partir do MongoDB. Pedidos consulta o catálogo uma vez por pedido, com todos os SKUs na mesma chamada.

Não há interface gráfica. O contrato está em `specs/` e o roteiro executável está em `scripts/demo.py`.

## O que sobe

| Serviço | Porta no host | Banco |
|---|---|---|
| Pedidos | 18080 | PostgreSQL 16, publicado em `localhost:54329` |
| Catálogo | 8081 | MongoDB 7, só na rede do Compose |

## Como rodar

Requisito: Docker com Compose.

```bash
docker compose up --build
```

Em outro terminal:

```bash
python3 scripts/demo.py
```

O script espera `/health` nos dois serviços, cria pedidos, confere centavos, SKU inativo, preço enviado pelo cliente e a troca da regra de desconto. Sai com código diferente de zero quando um total não fecha.

Parar e apagar os volumes:

```bash
docker compose down -v
```

## Configuração

O Compose já define as variáveis. Fora dele:

| Variável | Serviço | Valor local |
|---|---|---|
| `DATABASE_URL` | Pedidos | `postgres://orders:orders@localhost:54329/orders` |
| `CATALOG_BASE_URL` | Pedidos | `http://localhost:8081` |
| `PORT` | Pedidos | `8080` dentro da rede. No host o Compose publica `18080`, para não disputar um 8080 já usado. |
| `MONGO_URL` | Catálogo | `mongodb://localhost:27017` |
| `MONGO_DB` | Catálogo | `catalog` |

Dinheiro é inteiro, em centavos de BRL. O cliente manda SKU e quantidade. Preço no corpo do pedido responde 400.

A regra de desconto nasce no banco: a partir de R$ 200,00, 10% sobre o subtotal, arredondamento para baixo. Trocar o percentual:

```bash
curl -s -X PUT http://127.0.0.1:18080/discount-rules/11111111-1111-4111-8111-111111111111 \
  -H 'Content-Type: application/json' \
  -d '{"name":"Pedidos a partir de R$ 200,00 recebem 20%","minSubtotalCents":20000,"percent":20,"active":true}'
```

O pedido seguinte usa o novo percentual. O código da aplicação não muda.

## Testes

`npm` e `pip` rodam dentro das imagens. A máquina host não precisa de Node nem de um venv.

```bash
make test
```

`make test-catalog` usa `python:3.12-slim`. `make test-orders` usa `node:22-alpine` (`npm ci`, Vitest, `tsc`). O teste de PostgreSQL só corre quando `DATABASE_URL` está definida. No GitHub Actions o job `orders` sobe o Postgres e define essa variável. Na imagem de produção o `npm ci --omit=dev` não leva o Vitest.

Contratos: `specs/orders.openapi.yaml`, `specs/catalog.openapi.yaml`. Cenários: `specs/scenarios.md`.

## Documentos

| Arquivo | Conteúdo |
|---|---|
| `docs/adr/` | Fronteira, centavos, consulta em lote, desconto como dado |
| `docs/code-review-guide.md` | Critérios que barram o merge |
| `docs/proposal-sizing.md` | Esforço de três semanas, um sênior e um pleno |
| `docs/ai-development.md` | Ferramenta, processo e o modelo da revisão de mensagens |
| `docs/prompts/error-messages.md` | Prompt e a checagem da saída |
| `PLAN.md` | Plano de trabalho, em inglês |

## Fora deste corte

Autenticação, pagamento, cancelamento, interface, mais de uma moeda e chave de idempotência. Um segundo POST igual cria outro pedido.
