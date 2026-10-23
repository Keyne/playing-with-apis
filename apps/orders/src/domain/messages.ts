/**
 * Client-facing messages accepted for this API.
 * Review trail: docs/prompts/error-messages.md
 */
export const messages = {
  VALIDATION_ERROR: "Os dados do pedido não são válidos.",
  INVALID_QUERY: "Os parâmetros da consulta não são válidos.",
  UNKNOWN_SKU: "Um ou mais produtos não existem ou não têm preço vigente.",
  CATALOG_UNAVAILABLE: "O catálogo não respondeu. O pedido não foi gravado.",
  ORDER_NOT_FOUND: "Pedido não encontrado.",
  DISCOUNT_RULE_NOT_FOUND: "Regra de desconto não encontrada.",
  INTERNAL: "Não foi possível concluir a operação.",
} as const;
