# ADR 004 — A regra de desconto mora no banco

## Estado

Aceito.

## Decisão

A tabela `discount_rules` guarda nome, tipo (`PERCENT_OFF_SUBTOTAL`), mínimo em centavos, percentual, vigência e a flag `active`. O caso de uso lê a regra ativa a cada criação. `PUT /discount-rules/{id}` altera a linha. Ativar uma regra desativa as outras, na mesma transação.

A regra semeada é: a partir de R$ 200,00, 10%.

## Por quê

O enunciado diz que o desconto é configurável e não fica fixo no código. Um percentual escrito numa constante obrigaria um deploy para cada mudança comercial. Uma linha de banco muda com um `UPDATE` e continua coberta pelo mesmo teste.

## Consequência

Só existe um tipo de regra. Não há acúmulo de cupons. Abaixo do mínimo o desconto é zero e `discountRule` fica nulo. O nome e o percentual só são gravados quando a regra reduziu o total.

O pedido grava `discount_rule_name` e `discount_rule_percent` na própria linha. A leitura não junta a regra viva. Um `PUT` muda o próximo pedido e deixa os anteriores com o percentual que de fato foi cobrado.
