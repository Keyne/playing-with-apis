# Prompt — mensagens de erro das APIs

Ferramenta: ver `docs/ai-development.md`. O runtime não chama modelo nenhum. Este prompt revisa o catálogo de erros antes dele entrar no código.

## Prompt

```text
Você revisa mensagens de erro de duas APIs internas: Pedidos (HTTP, PostgreSQL)
e Catálogo (HTTP, MongoDB). O cliente é um sistema, não uma pessoa no balcão,
mas a mensagem é lida por quem opera o pedido.

Devolva somente um JSON array. Cada item tem "code" e "message".
Cubra exatamente estes codes, uma vez cada:
VALIDATION_ERROR, UNKNOWN_SKU, CATALOG_UNAVAILABLE, ORDER_NOT_FOUND,
DISCOUNT_RULE_NOT_FOUND, INTERNAL.

Regras da mensagem:
- Português do Brasil.
- Uma frase, entre 10 e 180 caracteres.
- Diga o que aconteceu e, quando couber, que nada foi gravado.
- Não inclua SQL, nome de tabela, stack, exception, traceback, placeholder $1,
  host, e-mail, nome de cliente nem preço que tenha vindo no pedido.
- Não prometa retry automático.
- VALIDATION_ERROR cobre corpo inválido, inclusive preço enviado pelo cliente.
- UNKNOWN_SKU cobre SKU desconhecido, inativo ou sem preço vigente.
- CATALOG_UNAVAILABLE cobre catálogo fora ou resposta ilegível. O pedido não grava.
- INTERNAL não explica a falha interna.
```

## Validação aplicada à saída

O script `scripts/review_error_messages.py` recusa a resposta quando qualquer item falha:

- o `code` não está na lista acima, ou falta algum, ou há repetido;
- a mensagem não é texto, ou tem menos de 10 ou mais de 180 caracteres já sem espaço nas pontas, ou sobra espaço no começo ou no fim;
- o texto contém `select `, `insert `, `stack`, `traceback`, `exception`, `$1`, `postgres` ou `mongo` (comparação em minúsculas);
- a mensagem contém `@`;
- a mensagem contém `tente novamente` ou `try again`.

Saída recusada não entra no código. O arquivo que o serviço usa é `apps/orders/src/domain/messages.ts`. As frases abaixo passaram nessa checagem nesta sessão e foram as aceitas:

| Code | Mensagem aceita |
|---|---|
| VALIDATION_ERROR | Os dados do pedido não são válidos. |
| UNKNOWN_SKU | Um ou mais produtos não existem ou não têm preço vigente. |
| CATALOG_UNAVAILABLE | O catálogo não respondeu. O pedido não foi gravado. |
| ORDER_NOT_FOUND | Pedido não encontrado. |
| DISCOUNT_RULE_NOT_FOUND | Regra de desconto não encontrada. |
| INTERNAL | Não foi possível concluir a operação. |

O catálogo usa duas frases próprias, no mesmo critério: consulta de SKU inválida e produto sem preço vigente. Elas estão em `apps/catalog/app/api.py`.
