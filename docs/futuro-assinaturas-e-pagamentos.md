# Futuro: assinaturas compartilhadas e pagamento retido

> **Status: NÃO IMPLEMENTAR.** Exige validação jurídica, regulatória e das regras de cada provedor antes de qualquer linha de código. Este documento existe pra não perder a ideia — não é uma especificação pronta pra construir.

**Criado:** 2026-09-14, a partir de uma proposta detalhada da Jéssica no chat. Separado do `docs/visao-produto.md` (que documenta o que o site *é e está construindo*) porque isso aqui é o oposto: o que decidimos **não** construir agora, e por quê — pra não ficar perdido no meio de decisões já tomadas.

## A ideia original

A Jéssica queria um recurso de "Grupos de Economia" pra assinaturas compartilhadas — começando por Netflix — usando o caminho **oficial** de "assinante extra" (não senha compartilhada): o titular paga um pouco mais pro Netflix, a pessoa extra recebe login/senha/perfil próprios do próprio Netflix, nunca um e-mail+senha compartilhados entre desconhecidos.

Desenho completo que ela propôs:

### Cards de grupo

```
Grupos para economizar
NETFLIX
Premium
2 de 3 vagas ocupadas
1 vaga disponível
Próxima cobrança: 20/09
[ Participar ]
```

Três tipos: **Aberto** (tem vaga), **Quase completo** (falta 1), **Criar grupo** (pra quem já tem assinatura com vaga sobrando).

### Fluxo de participação

```
Usuário → Participar → TOP3 verifica vaga → reserva a vaga por alguns minutos
→ mostra quanto a pessoa vai pagar → pagamento → titular recebe "X entrou no seu grupo"
→ titular envia convite oficial do Netflix → pessoa cria a própria conta/senha
→ TOP3 confirma participação
```

### Busca conversacional

"quero dividir Netflix" → TOP3 mostra os grupos disponíveis. "tenho Netflix Premium e quero colocar alguém" → TOP3 cria o grupo perguntando só o indispensável.

### Reputação

```
✓ Titular verificado
✓ Pagamentos em dia
✓ 11 meses de grupo
★ 4,9 (23)
```

### Retenção de pagamento (escrow)

```
participante paga → TOP3 segura → convite enviado → participante ativa
→ TOP3 confirma → pagamento liberado
```
Motivo: evitar alguém anunciar "Netflix Premium — R$20", receber de dez pessoas e sumir.

### Fila de substituição automática

```
Grupo Netflix, 3/3 → Maria saiu → vaga = aberta → TOP3 procura alguém na fila
→ Carlos recebe "Abriu uma vaga por R$X" → [ Entrar ]
```

### Regras por serviço (`service_rules`)

```
Netflix
├── password_sharing = false
├── outside_household = extra_member_only
├── own_login = true
├── same_country_required = true
└── eligibility_check = true
```
Ideia: cada serviço tem uma configuração dizendo o que ele oficialmente permite — nunca assumir que "plano família" significa que desconhecidos podem dividir.

### Modelo de dados (versão completa, com pagamento)

```
groups: id, service, owner_id, monthly_cost, available_slots, status, billing_day
group_members: group_id, user_id, status, joined_at
payments: group_id, user_id, amount, status, month
reputation: user_id, score, completed_months, incidents
```

## Por que isso não entra em código ainda

Duas categorias de risco diferentes, levantadas na conversa de 2026-09-14:

1. **Risco pro titular, mesmo pelo caminho oficial.** O Netflix detecta compartilhamento fora de casa por IP/dispositivo/localização. Um marketplace com gente entrando e saindo de grupos com frequência (a própria fila de substituição descrita acima) é exatamente o padrão que dispara alerta de fraude — e quem paga o preço é o titular que confiou no site, com a própria conta restringida. Os termos de uso do Netflix também dizem "uso pessoal e não comercial" — uma plataforma organizando isso como serviço pago entre desconhecidos provavelmente ainda viola isso, mesmo usando o "assinante extra" oficial (pesquisado em 2026-09-14, ver `docs/visao-produto.md` pilar 4.14 e a conversa original).
2. **Regulação de pagamento, independente do risco acima.** "TOP3 segura o pagamento até confirmar" é intermediação financeira de terceiros — atividade regulada pelo Banco Central no Brasil. Isso já era o pilar 4.10 do `docs/visao-produto.md`, deixado de propósito pro final do roadmap ("fica pra tratar como projeto à parte quando chegarmos nele", seção 9). Construir isso agora, num site sem usuário real ainda, contradiz o próprio plano da Jéssica de "gastar o mínimo, construir confiança por 1-3 anos, monetizar só depois".

## O que fazer antes de reconsiderar isso

- Assessoria jurídica real sobre intermediação de pagamento (registro no Banco Central como Instituição de Pagamento, ou modelo que dispense isso).
- Confirmação atualizada dos termos de uso de cada serviço específico que se queira incluir (não assumir que o que vale pro Netflix vale pra outro).
- Volume real de usuários no site — sem isso, o risco/esforço não se paga.
- Reconsiderar se o "assinante extra" resolve juridicamente, ou se some do escopo e o foco vira só categorias sem esse conflito (streaming/assinatura ficaria fora de vez, e o motor de Grupos de Economia — pilar 4.14, já implementado — continua só pras 5 categorias sem esse risco).

Até lá: o motor de Grupos de Economia (pilar 4.14) já resolve a parte boa e segura da ideia (compra coletiva, frete, viagem, serviço, curso) sem carteira, sem escrow e sem esbarrar em termo de terceiro nenhum.
