# Dimensionamento — Pedidos e Catálogo em três semanas

Entrega das partes 1 e 2 do edital, com um desenvolvedor sênior e um pleno. Calendário de três semanas. Premissas no fim. O que ficou de fora não entra nesta conta.

## Time

| Papel | Foco |
|---|---|
| Sênior | Contrato, fronteira entre os serviços, SQL, regra de desconto, revisão de todo PR, prompt e checagem das mensagens |
| Pleno | Catálogo, rotas HTTP, testes de cenário, Compose, workflow de CI, roteiro `demo.py` |

Os dois leem os dois códigos. O pleno abre PR pequeno. O sênior não acumula fila: revisão no mesmo dia.

## Esforço

Dia produtivo é dia em que a pessoa escreve ou revisa código deste escopo. Cada pessoa perde meio dia por semana com revisão, alinhamento e espera de CI. Em três semanas são 3 dias de pessoa. Sobram cerca de 27. O plano usa 24.

| Bloco | Dias de pessoa | Quem puxa |
|---|---:|---|
| Especificação, OpenAPI, ADRs, cenários | 3 | Sênior, pleno revisa |
| Catálogo, seed, consulta em lote, testes | 4 | Pleno |
| Domínio de pedido, HTTP, testes em memória | 6 | Os dois |
| PostgreSQL, transação, teste de integração | 4 | Sênior |
| Desconto como dado e troca da regra | 2 | Sênior |
| Compose, demo, GitHub Actions | 3 | Pleno |
| Guia de revisão, dimensionamento, nota de IA | 2 | Sênior |
| **Total** | **24** | |

## Semanas

Semana 1. Spec fechada antes do handler. Catálogo no ar com os SKUs de exemplo, inclusive inativo e preço futuro. Pedidos ainda não grava.

Semana 2. Criar, listar e buscar pedido. Preço só do catálogo. Desconto lido da tabela. Teste de PostgreSQL na CI.

Semana 3. Compose único, demo com os totais do cenário, guia de revisão e este dimensionamento. Folga de um dia de pessoa no fim para corrigir o que a revisão devolver. Sem essa folga a terceira semana estoura no primeiro defeito de contrato.

## Premissas

- Sem tela, login, pagamento, cancelamento ou segunda moeda.
- Catálogo é leitura. O seed sobe com a coleção vazia. Não há CRUD de produto.
- Uma regra de desconto ativa. Ativar outra desliga as demais na mesma transação.
- Os dois serviços rodam no laptop com Docker Compose. Sem Kubernetes.
- A CI constrói a imagem depois dos testes e não publica em registro.
- A revisão das mensagens de erro é ferramenta de desenvolvimento. Criar pedido não chama modelo.
- O repositório segue GitFlow: `feature/*` entra em `develop` com merge sem fast-forward, e `develop` entra em `main` no corte.

## Riscos que o prazo assume

Catálogo fora do ar responde 503 e não grava pedido. Não há cache de preço no Pedidos. Se o catálogo ficar instável na semana 2, o pleno trata timeout e o sênior não abre escopo de fila.

Dois cliques iguais criam dois pedidos. Idempotência é outro corte, cerca de dois dias de pessoa, e não cabe nas três semanas sem tirar a CI ou o guia.

Não há cotação separada do pedido. O cliente vê o preço no catálogo e o total só depois do POST. Uma cotação com validade seria outro endpoint e outro estado. Fica fora.

O sênior ausente uma semana quebra a conta: a revisão é o gate, e o pleno não aprova o próprio SQL.
