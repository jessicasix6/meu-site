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

## Integração com WhatsApp

O código do webhook já está em `whatsapp.js`, plugado em `/webhook/whatsapp`, mas só funciona de verdade com uma conta WhatsApp Business API configurada:

1. Crie um app em [developers.facebook.com/apps](https://developers.facebook.com/apps), produto "WhatsApp".
2. Na aba **API Setup**, pegue o `WHATSAPP_ACCESS_TOKEN` (token temporário pra teste) e o `WHATSAPP_PHONE_NUMBER_ID`.
3. Escolha um `WHATSAPP_VERIFY_TOKEN` (qualquer string sua) e coloque as três variáveis no `.env`.
4. Publique o servidor em algum domínio público (localhost não funciona aqui — use `ngrok` pra testar antes do deploy real).
5. Na aba **Configuration** do app, configure o webhook apontando para `https://SEU-DOMINIO/webhook/whatsapp`, usando o mesmo `WHATSAPP_VERIFY_TOKEN`, e assine o campo `messages`.

Depois de configurado: qualquer mensagem de texto recebida vira uma pergunta pro mesmo agente que responde no site. Mensagens no formato `aceitar <id>` (ex: `aceitar r1`) aceitam um pedido em aberto, do mesmo jeito que o botão "aceitar" no painel do prestador.

## Worker do TOP3 (Passo 12)

Pipeline de automação: tarefas ficam numa fila de **GitHub Issues** (label `top3-task`), e uma rotina agendada na nuvem (Claude Code, dispara toda hora) processa uma tarefa `status:pending` por vez — implementa, testa, se aprovar abre PR; só faz merge automático se a issue tiver a label `risk:low`, senão troca pra `status:review` e para, esperando aprovação manual. Todo o histórico do processamento (branch, resultado dos testes, auto-revisão, link do PR, confirmação de deploy) fica registrado como comentários na própria issue.

Como o worker roda na nuvem (sem acesso a arquivos/variáveis locais), usar o GitHub como fila evita precisar embutir nenhuma credencial de banco de dados no prompt da rotina — ele já tem acesso ao repo via `gh`, que é o suficiente.

Labels usadas: `top3-task` (marca a issue como tarefa da fila), `status:pending` / `status:in-progress` / `status:review` / `status:done` / `status:failed`, `risk:low` / `risk:medium` / `risk:high`.

Pra colocar uma tarefa na fila: abra uma issue no repo com a label `top3-task` + `status:pending` + o nível de risco (`risk:low`, `risk:medium` ou `risk:high`), título curto e a descrição do que deve ser feito no corpo.
