# ADR 002 — Dinheiro em centavos inteiros

## Estado

Aceito.

## Decisão

Todo valor monetário é um inteiro em centavos de BRL. Não há `float` nem `Decimal` na conta do pedido. A moeda é única e fica explícita no campo `currency`.

## Por quê

Dez por cento de R$ 199,99 em ponto flutuante não fecha com o que uma pessoa espera ver no total. Centavos e divisão inteira (`floor(subtotal * percent / 100)`) são determinísticos e fáceis de testar.

## Consequência

A regra de 10% a partir de R$ 200,00 está gravada como `min_subtotal_cents = 20000` e `percent = 10`. O total do pedido obedece `total = subtotal - discount`, com `discount <= subtotal`, também como `CHECK` no PostgreSQL.
