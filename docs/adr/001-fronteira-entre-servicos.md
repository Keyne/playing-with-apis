# ADR 001 — Dois serviços, dois bancos, HTTP no meio

## Estado

Aceito.

## Decisão

Pedidos é Node.js com TypeScript, Fastify e PostgreSQL. Catálogo é Python com FastAPI e MongoDB. Eles se falam por HTTP. Nenhum dos dois lê o banco do outro.

## Por quê

O enunciado pede um banco relacional para o pedido e um banco de documentos para o catálogo, e pede que o primeiro consuma o segundo. Duas linguagens tornam essa fronteira impossível de furar por um import acidental. Também dão ao guia de code review dois códigos reais para falar de squads multi-stack.

PostgreSQL entra porque o pedido é uma transação: cliente, cabeçalho e itens saem juntos ou não saem. MongoDB entra porque o produto é um documento com o preço vigente embutido, e um `find` com `$in` cobre o pedido inteiro.

## Consequência

Não há frontend. O contrato é o OpenAPI em `specs/`. O preço que vale é o que o catálogo devolve na hora do `POST`. O pedido guarda uma cópia desse preço na linha.
