# Top3Profissional

Domínio: top3profissional.com.br (registrado no registro.br).

Fonte da verdade em `main`. Fluxo de trabalho:

```
IDEIA
↓
Replit experimenta (sandbox/replit/task-NNN)
↓
decisão: vale a pena?
↓
Claude implementa (agent/claude/task-NNN)
↓
Cursor revisa (review/cursor/task-NNN se precisar editar)
↓
Verifier testa (GitHub Actions + Playwright)
↓
main
↓
staging → produção
```

`main` é protegida: sem push direto, PR obrigatório, testes precisam passar antes do merge.

## Rodando localmente

```
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
npm start
```

## Variáveis de ambiente (`.env`)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `ANTHROPIC_API_KEY` | recomendada | Chave da Claude API (console.anthropic.com/settings/keys). Sem ela o servidor sobe normalmente, mas `/api/chat` e as respostas via WhatsApp retornam erro. |
| `WHATSAPP_VERIFY_TOKEN` | não | Ver seção WhatsApp abaixo. |
| `WHATSAPP_ACCESS_TOKEN` | não | Ver seção WhatsApp abaixo. |
| `WHATSAPP_PHONE_NUMBER_ID` | não | Ver seção WhatsApp abaixo. |
| `SUPABASE_URL` | não | Ver seção "Worker do TOP3" abaixo. |
| `SUPABASE_SECRET_KEY` | não | Ver seção "Worker do TOP3" abaixo. Nunca é a chave "publishable" — precisa ser a "secret". |
| `WORKER_TOKEN` | não | Ver seção "Worker do TOP3" abaixo. |

## Integração com WhatsApp

O código do webhook já está em `whatsapp.js`, plugado em `/webhook/whatsapp`, mas só funciona de verdade com uma conta WhatsApp Business API configurada:

1. Crie um app em [developers.facebook.com/apps](https://developers.facebook.com/apps), produto "WhatsApp".
2. Na aba **API Setup**, pegue o `WHATSAPP_ACCESS_TOKEN` (token temporário pra teste) e o `WHATSAPP_PHONE_NUMBER_ID`.
3. Escolha um `WHATSAPP_VERIFY_TOKEN` (qualquer string sua) e coloque as três variáveis no `.env`.
4. Publique o servidor em algum domínio público (localhost não funciona aqui — use `ngrok` pra testar antes do deploy real).
5. Na aba **Configuration** do app, configure o webhook apontando para `https://SEU-DOMINIO/webhook/whatsapp`, usando o mesmo `WHATSAPP_VERIFY_TOKEN`, e assine o campo `messages`.

Depois de configurado: qualquer mensagem de texto recebida vira uma pergunta pro mesmo agente que responde no site. Mensagens no formato `aceitar <id>` (ex: `aceitar r1`) aceitam um pedido em aberto, do mesmo jeito que o botão "aceitar" no painel do prestador.

## Worker do TOP3 (Passo 12)

Pipeline de automação: tarefas ficam numa fila no Supabase (`supabase/schema.sql` cria as tabelas `tasks`, `agent_runs`, `branches`, `reviews`, `verifications`, `deployments`, `evidence`), e uma rotina agendada na nuvem (Claude Code) processa uma tarefa `pending` por vez — implementa, testa, se aprovar abre PR; só faz merge automático se `risk = "low"`, senão para em `status = "review"` esperando aprovação manual.

Como o worker roda na nuvem (sem acesso a arquivos/variáveis locais), ele não fala direto com o Supabase — ele chama `POST /internal/db` neste servidor, autenticado com `WORKER_TOKEN`, que encaminha a chamada usando a chave secreta do Supabase (que fica só aqui, nunca no prompt da rotina). Configuração:

1. Rode `supabase/schema.sql` uma vez no SQL Editor do projeto Supabase (com RLS habilitado nas tabelas).
2. Pegue `SUPABASE_URL` e a chave **secret** (não a publishable) em Project Settings → API.
3. Gere um `WORKER_TOKEN` aleatório (ex: `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`).
4. Coloque as três variáveis no `.env` local e nas variáveis do serviço no Railway.
5. Insira uma linha em `tasks` (via SQL Editor ou `POST /internal/db`) pra colocar uma tarefa na fila; `type` é `experiment`, `implementation` ou `review`, `risk` é `low`, `medium` ou `high`.
