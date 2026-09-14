# Futuro: assinaturas compartilhadas e pagamento retido

> **Status: NÃO IMPLEMENTAR** (a parte de verificação/escrow/reputação/denúncia abaixo). Exige validação jurídica, regulatória e das regras de cada provedor antes de qualquer linha de código. Este documento existe pra não perder a ideia — não é uma especificação pronta pra construir.
>
> **Atualização (2026-09-14, task-001): a parte "boa" já foi implementada.** Assinatura/streaming virou uma categoria genérica dentro de Grupos de Economia (pilar 4.14 do `docs/visao-produto.md`) — sem engine especial, sem verificação de credencial, sem TOP3 reter pagamento, com um aviso fixo deixando claro que o site só ajuda a se encontrar. O que continua **fora** de escopo (e é o conteúdo deste documento) é tudo que envolve o TOP3 verificar, garantir ou intermediar algo: reputação, denúncia, escrow.

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

Até lá: o motor de Grupos de Economia (pilar 4.14) já resolve a parte boa e segura da ideia (compra coletiva, frete, viagem, serviço, curso, **e agora também assinatura**, como categoria genérica sem verificação/escrow) sem carteira, sem escrow e sem esbarrar em termo de terceiro nenhum.

---

## Reputação + Denúncia (desenho completo, 2026-09-14)

Proposta detalhada da Jéssica pro que viria depois de Grupos de Economia ter login/conta obrigatória e volume real de uso. **Continua fora de escopo enquanto essas duas coisas não existirem** — reputação sem identidade estável entre sessões não se sustenta (qualquer um troca de "usuário" fingindo ser outra pessoa). Registrado aqui pra não perder o desenho, não como algo pronto pra construir.

**Princípio central:** reputação é *informação*, não *garantia*. O TOP3 sinaliza histórico, nunca promete reembolso nem segura nada.

**Cuidado de design já incorporado:** denúncia sem filtro vira arma de perseguição (alguém perde no combinado e "se vinga" denunciando à toa) — por isso a triagem antes de qualquer denúncia afetar reputação de verdade.

### Modelo de dados

```
Usuario (campos novos, exige login/conta já existir)
- reputacao_score (começa em 100)
- grupos_concluidos
- denuncias_recebidas
- denuncias_procedentes
- status (ativo | restrito | suspenso)

Denuncia
- id
- grupo_id
- denunciante_id
- denunciado_id
- motivo (nao_entregou | sumiu_apos_pix | valor_diferente_combinado | outro)
- descricao
- evidencia (opcional, print/texto)
- status (aberta | em_analise | procedente | improcedente)
- created_at
- resolvida_at
```

### Regras de negócio

1. Só pode denunciar quem participou de fato do grupo (`status = confirmado` naquele `grupo_id`) — evita denúncia de gente de fora.
2. Denúncia entra como `aberta`, não muda reputação ainda. Vira `em_analise` e some do perfil público até ser resolvida.
3. Triagem simples: se 2+ pessoas de grupos diferentes denunciarem o mesmo usuário pelo mesmo motivo, o caso vira prioritário pra revisão manual (não precisa de moderador humano no dia 1 — pode ser a própria Jéssica revisando via painel simples).
4. Denúncia `procedente`: `-25` na reputação, incrementa `denuncias_procedentes`, badge visível no perfil ("2 denúncias confirmadas").
5. Reputação abaixo de 40 → status `restrito` (não pode criar grupo novo, só participar). Abaixo de 20 → `suspenso` (perfil oculto).
6. Denúncia `improcedente` → sem efeito nenhum na reputação de ninguém (protege quem foi denunciado à toa).
7. Grupo concluído sem denúncia em 7 dias → soma ponto de reputação pros dois lados (reforça histórico bom).

### Telas previstas

- No detalhe do grupo, participantes confirmados veem botão "Relatar problema" (só aparece depois que o grupo foi marcado como concluído).
- No perfil de qualquer usuário: selo de reputação + texto fixo: "Reputação é baseada em histórico de grupos. O TOP3 não garante nem intermedeia pagamentos — sempre combine e confirme antes de pagar."

### Pré-requisitos antes de retomar

1. Login/conta de usuário existir no site (hoje "Grupos" funciona só com WhatsApp, sem conta obrigatória — ver pilar 4.14).
2. Primeiros usuários reais rodando o mecanismo de Grupos sem essa camada, pra validar que o básico funciona antes de empilhar reputação em cima.
