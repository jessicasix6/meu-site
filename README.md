# Top3Profissional

Marketplace de serviços locais com busca por IA. Domínio: top3profissional.com.br (registrado no registro.br).

📄 **Visão completa do produto**: [`docs/visao-produto.md`](docs/visao-produto.md) — a fonte da verdade da ideia, consultada e expandida antes de qualquer missão de implementação grande. Inclui também os [princípios estratégicos](docs/visao-produto.md#3-princípios-estratégicos-inspirados-em-a-arte-da-guerra-sugestão-da-jéssica-2026-09-10) inspirados em [A Arte da Guerra](docs/a-arte-da-guerra.md).

Fonte da verdade em `main`. Fluxo de trabalho:

```
IDEIA
↓
issue no GitHub (label top3-task) ou implementação direta
↓
Claude implementa (agent/claude/task-NNN)
↓
CodeRabbit revisa o PR automaticamente + auto-revisão do Claude
↓
Verifier testa (GitHub Actions + Playwright)
↓
main
↓
deploy automático no VPS (rollback automático se o /health falhar)
```

`main` é protegida: sem push direto, PR obrigatório, testes precisam passar antes do merge.

## PWA

O site é instalável como app (PWA) — "adicionar à tela inicial" no celular abre em tela cheia, com ícone próprio, sem barra de navegador. `manifest.json` define nome/ícones/cores, `sw.js` cacheia o esqueleto estático (HTML/CSS/JS/fontes/ícones) pra abrir rápido mesmo com conexão ruim. Nunca cacheia `/api/`, `/webhook/` nem `/health` — esses dados são sempre buscados na hora, nunca servidos do cache.

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
| `BRAVE_SEARCH_API_KEY` | não | Chave da [Brave Search API](https://api-dashboard.search.brave.com/register). Sem ela, o agente responde só com o catálogo interno de profissionais (mock) — com ela, também busca na web de verdade pra pedidos fora desse catálogo (terreno, carro, etc.). Tem um limite mensal de segurança no código (`BRAVE_SEARCH_MONTHLY_LIMIT` em `server.js`) pra não estourar orçamento. |

## Integração com WhatsApp

O código do webhook já está em `whatsapp.js`, plugado em `/webhook/whatsapp`, mas só funciona de verdade com uma conta WhatsApp Business API configurada:

1. Crie um app em [developers.facebook.com/apps](https://developers.facebook.com/apps), produto "WhatsApp".
2. Na aba **API Setup**, pegue o `WHATSAPP_ACCESS_TOKEN` (token temporário pra teste) e o `WHATSAPP_PHONE_NUMBER_ID`.
3. Escolha um `WHATSAPP_VERIFY_TOKEN` (qualquer string sua) e coloque as três variáveis no `.env`.
4. Publique o servidor em algum domínio público (localhost não funciona aqui — use `ngrok` pra testar antes do deploy real).
5. Na aba **Configuration** do app, configure o webhook apontando para `https://SEU-DOMINIO/webhook/whatsapp`, usando o mesmo `WHATSAPP_VERIFY_TOKEN`, e assine o campo `messages`.

Depois de configurado: qualquer mensagem de texto recebida vira uma pergunta pro mesmo agente que responde no site. Comandos reconhecidos, espelhando o ciclo de vida do pedido (ver seção abaixo):

- `aceitar r1` ou `aceitar r1 Carlos Motoboy` — aceita um pedido em aberto
- `concluir r1` — marca um pedido aceito como concluído
- `avaliar r1 5 Ótimo atendimento!` — avalia (1-5) um pedido concluído, comentário opcional

## Publicar por conversa (sem formulário)

Além do formulário, o agente (`/api/chat`, e por consequência o WhatsApp também) consegue publicar um pedido direto pela conversa — a pessoa só precisa confirmar a intenção ("quero publicar uma corrida do Centro pra Rodoviária hoje às 20h, pago R$25"). O agente nunca publica sozinho só porque alguém descreveu o que procura — sempre espera confirmação explícita, e confirma de volta o que foi publicado.

## Ciclo de vida de um pedido

`POST /api/requests` cria um pedido em qualquer categoria (`type` é texto livre — corrida, terreno, carro, o que for), sempre começando em `status: "aberto"`. Depois disso:

1. `POST /api/requests/:id/accept` (body opcional `{ "provider": "Nome" }`) — vira `"aceito"`.
2. `POST /api/requests/:id/complete` — só funciona se estiver `"aceito"`; vira `"concluído"`.
3. `POST /api/requests/:id/rate` (body `{ "rating": 1-5, "comment": "opcional" }`) — só funciona se estiver `"concluído"` e ainda não avaliado.

Cada passo só avança se o anterior tiver acontecido — não dá pra concluir sem aceitar, nem avaliar sem concluir, nem avaliar duas vezes.

## Worker do TOP3 (Passo 12)

Pipeline de automação: tarefas ficam numa fila de **GitHub Issues** (label `top3-task`), e uma rotina agendada na nuvem (Claude Code, dispara toda hora) processa uma tarefa `status:pending` por vez — implementa, testa, se aprovar abre PR; só faz merge automático se a issue tiver a label `risk:low`, senão troca pra `status:review` e para, esperando aprovação manual. Todo o histórico do processamento (branch, resultado dos testes, auto-revisão, link do PR, confirmação de deploy) fica registrado como comentários na própria issue.

Como o worker roda na nuvem (sem acesso a arquivos/variáveis locais), usar o GitHub como fila evita precisar embutir nenhuma credencial de banco de dados no prompt da rotina — ele já tem acesso ao repo via `gh`, que é o suficiente.

Labels usadas: `top3-task` (marca a issue como tarefa da fila), `status:pending` / `status:in-progress` / `status:review` / `status:done` / `status:failed`, `risk:low` / `risk:medium` / `risk:high`.

Pra colocar uma tarefa na fila: abra uma issue no repo com a label `top3-task` + `status:pending` + o nível de risco (`risk:low`, `risk:medium` ou `risk:high`), título curto e a descrição do que deve ser feito no corpo.

