# ADR 003 — Uma consulta de preço por pedido

## Estado

Aceito.

## Decisão

`GET /products?skus=A,B,C` devolve o preço vigente de todos os SKUs pedidos. A implementação é um único `find` com `sku: { $in: [...] }`, `active: true` e `price.validFrom <= agora`.

Pedidos chama esse endpoint uma vez. SKU desconhecido, inativo ou com preço ainda no futuro volta em `missing` e o pedido não é gravado.

## Por quê

O enunciado veta o padrão de uma consulta ao banco por item dentro de um laço. O mesmo vale para a chamada HTTP: três itens não podem virar três requests.

A linha do pedido copia `unitPriceCents` e o nome. Uma mudança posterior no catálogo não reescreve a história do pedido.

## Consequência

O cliente não envia preço. Um corpo com `unitPriceCents` é rejeitado com 400. Não existe etapa de cotação separada: o preço é lido na criação.
