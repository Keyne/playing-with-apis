# Guia de revisão — Pedidos e Catálogo

Uma página e meia para o revisor de um squad com duas stacks. O merge em `develop` espera estes critérios. Comentário de estilo não segura o PR. Os itens da seção seguinte seguram.

O revisor lê o diff inteiro, o teste novo e o contrato em `specs/` quando o HTTP mudou. Pedidos é TypeScript (Fastify, `pg`). Catálogo é Python (FastAPI, Motor). A regra vale nos dois lados: o caso de uso não importa o framework nem o driver.

## O que barra o merge

1. **SQL ou filtro montado com texto do cliente.** Valor de pedido, SKU, e-mail ou cursor entra só como parâmetro (`$1`, `$in` com lista ligada). Concatenar esse texto na string da query barra o PR. Montar a lista de placeholders a partir da quantidade de linhas é permitido, desde que os valores continuem no array de parâmetros e um teste leia o SQL e prove que não há literal entre aspas.

2. **Dinheiro em ponto flutuante, ou preço vindo do cliente.** Centavos são inteiros. O corpo de criação aceita SKU e quantidade. Campo de preço no JSON é 400 e não grava linha. O preço da linha é o que o catálogo devolveu naquela chamada.

3. **Uma ida ao banco ou ao catálogo por item.** Criar pedido faz uma chamada HTTP com todos os SKUs. O catálogo faz um `find` com `$in`. Listar pedidos carrega os itens com `order_id = ANY($1::uuid[])`. Um `for` que consulta preço ou item por linha barra o PR.

4. **Caso de uso importando framework ou driver.** `createOrder` e o domínio de produto não importam Fastify, `pg`, FastAPI nem Motor. Adaptador HTTP e repositório ficam na borda. Import cruzado barra o PR.

5. **Criação de pedido só com banco falso.** O teste de unidade com repositório em memória permanece. O PR que altera gravação também mantém o teste que abre PostgreSQL, grava o pedido e lê os centavos na tabela. Apagar esse caminho, ou deixá-lo sempre ignorado na CI, barra o PR.

6. **Segredo no diff.** Senha, token, chave de API e `.env` real não entram no commit. A revisão de mensagens lê `XAI_API_KEY` do ambiente na hora de rodar. A imagem e o workflow não recebem essa chave.

7. **Erro que vaza implementação.** O JSON de erro leva `code` e `message`. Stack, SQL, nome de tabela e texto de exceção no corpo barram o PR. Log interno pode ter o detalhe. O cliente não recebe.

## O que segue como comentário

Nome, ordem de funções e tamanho de arquivo ficam no comentário quando o comportamento e os testes estão certos. Duplicar uma frase de validação entre as duas stacks também fica no comentário: cada serviço tem o seu contrato e as mensagens do catálogo não passam pelo catálogo TypeScript.

Um PR pode mudar a regra de desconto só por dado (`PUT /discount-rules/{id}`). Mudar o percentual dentro de uma função de domínio, com o limiar escrito no código, volta para o item 2 da seção anterior no espírito da regra: a política comercial é linha de tabela.

## Como registrar

No review do GitHub: um comentário por item barrado, com o arquivo e a linha. O autor corrige ou explica no fio. O sênior aprova. A CI (`catalog`, `orders`, depois `package`) precisa estar verde. `release` só corre num push em `main`, depois de `package`, e é o passo de publicação. Sem registry ele constrói as imagens e não faz push.
