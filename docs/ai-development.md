# Desenvolvimento com IA

## Ferramenta

O ciclo deste repositório foi feito no Grok, no aplicativo Grok Build, em uma sessão contínua. A ferramenta lê o edital, escreve o plano, os contratos, os dois serviços, os testes e estes documentos, e roda os testes em Docker.

SAI APP 3.0 não foi usada. O edital trata o uso de SAI como diferencial, e pede que a ferramenta real fique declarada. A ferramenta real é o Grok.

Por que esta: o trabalho atravessa especificação, duas linguagens e a revisão do texto de erro. Uma sessão com o repositório aberto mantém o contrato e o código no mesmo fio. O modelo da revisão de mensagens é outro processo, de propósito, para a checagem poder rodar de novo sem esta sessão.

## Processo

1. Leitura do PDF do edital e plano em `PLAN.md`.
2. Cenários em `specs/scenarios.md` e OpenAPI dos dois serviços antes dos handlers.
3. ADRs da fronteira, dos centavos, da consulta em lote e do desconto como dado.
4. Catálogo com teste de um único `find` `$in`. Pedidos com teste de uma chamada ao catálogo e de SQL só com placeholders.
5. Compose, CI que exige os testes antes do build da imagem, demo com os totais.
6. Prompt das mensagens de erro e script que recusa saída inválida.

O código de produção não pede sugestão ao modelo em tempo de execução. `POST /orders` calcula subtotal, desconto e total no processo.

## Revisão das mensagens — qual modelo

Há dois provedores. O padrão do script é uma API externa no formato OpenAI. A alternativa é um modelo local.

| | Padrão | Alternativa |
|---|---|---|
| Variável | `AI_PROVIDER=xai` (é o padrão) | `AI_PROVIDER=ollama` |
| Onde corre | `https://api.x.ai/v1/chat/completions` | Ollama em `OLLAMA_BASE_URL` (padrão `http://127.0.0.1:11434`) |
| Credencial | `XAI_API_KEY` | Nenhuma |
| Modelo | `XAI_MODEL`, obrigatório. O id vigente está em <https://docs.x.ai>. O script não grava um id chutado. | `OLLAMA_MODEL`, padrão `qwen2.5:7b` |

```bash
# API externa. Sem XAI_MODEL o script para.
XAI_API_KEY=... XAI_MODEL=... python3 scripts/review_error_messages.py

# Modelo local, família Qwen, nesta máquina.
AI_PROVIDER=ollama OLLAMA_MODEL=qwen2.5:7b python3 scripts/review_error_messages.py --write
```

`--write` grava `docs/prompts/error-catalog.suggestion.json` somente se a checagem passar. O script não altera `apps/orders/src/domain/messages.ts`. Quem mantém o serviço copia a frase aceita.

A checagem está em `scripts/review_error_messages.py` e descrita em `docs/prompts/error-messages.md`: os seis codes, uma vez cada, frase em português entre 10 e 180 caracteres, sem SQL, stack, `$1`, postgres, mongo ou `@`.

Nesta sessão não havia `XAI_API_KEY`, então a API externa não rodou. O Ollama local respondeu com `qwen2.5:7b`. As frases que o serviço entrega foram escritas e conferidas contra as mesmas regras nesta sessão do Grok, e estão na tabela de `docs/prompts/error-messages.md`. A CI não usa chave nem GPU. O job de teste não chama o script.

## Chamada local nesta sessão

`AI_PROVIDER=ollama OLLAMA_MODEL=qwen2.5:7b python3 scripts/review_error_messages.py --write` rodou contra o Ollama desta máquina. A checagem daquele momento imprimiu `aceito` e gravou `docs/prompts/error-catalog.suggestion.json`.

A leitura da saída recusou duas frases. `ORDER_NOT_FOUND` começa com espaço. `INTERNAL` pede para tentar de novo, e o prompt proíbe promessa de nova tentativa. `messages.ts` não foi alterado. O script passou a recusar espaço nas pontas e as expressões `tente novamente` e `try again`. O JSON gravado continua no repositório como a resposta do modelo. Uma checagem nova aponta esses dois problemas e não copia nada para o TypeScript.

## Link da conversa

O edital pede o link do chat usado. Cole aqui o link compartilhável desta sessão antes de enviar o repositório:

`<!-- link -->`
