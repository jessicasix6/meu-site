# Queries Otimizadas pro Worker (reduz tokens)

## 🎯 Princípio: Ler TUDO mas não MANDAR tudo

Processar dados LOCALMENTE antes de enviar pro Claude.

---

## 1️⃣ PASSO 0: Ler autorizações (só NOVAS)

```bash
# ❌ INEFICIENTE: sempre ler últimos 10 comentários
gh issue view 98 --comments --json comments

# ✅ OTIMIZADO: ler últimos 3 (reduz 70% leitura)
gh issue view 98 --comments --json comments \
  | jq '.comments[-3:]'

# Depois filtrar localmente:
# if "autorizo 1" in comment → processa
# if já processou antes → pula
```

**Economia:** -70% leitura de comentários

---

## 2️⃣ PASSO 1: Retomar PRs (filtro local)

```bash
# ❌ INEFICIENTE: mandar tudo pro Claude analisar
gh pr list --state open --json number,title,statusCheckRollup

# ✅ OTIMIZADO: filtrar localmente ANTES
gh pr list --state open --json number,title,statusCheckRollup \
  | jq '.[] | select(.statusCheckRollup == "success" and .labels[] | select(.name == "risk:low"))'

# Resultado: só PRs verdes + risk:low chegam até Claude
# Resto você já sabe: é pra fazer merge direto
```

**Economia:** -80% análise de PR (automático local)

---

## 3️⃣ PASSO 3: Observar (ler NOVO, não TUDO)

```bash
# ❌ INEFICIENTE: toda execução ler 20 issues
# (cada hora, rele as mesmas 20)

# ✅ OTIMIZADO: ler SÓ NOVAS desde última execução
ULTIMA_EXECUCAO="2026-09-22T10:00:00Z"  # guarda em WORKER-CACHE.json

gh issue list --state open \
  --json number,createdAt,title,body,labels \
  --jq ".[] | select(.createdAt > \"$ULTIMA_EXECUCAO\")"

# Resultado: só issues criadas NA ÚLTIMA HORA
# Issues antigas? Já processou, pula
```

**Economia:** -90% redundância (não rele o que viu)

---

## 4️⃣ PASSO 4: Identificar + Filtro pré-Claude

```bash
# ❌ INEFICIENTE: mandar TUDO pro Claude decidir
# "Issue: botão cortado no mobile CSS. O que fazer?"
# Claude: "Parece risco baixo, cria PR"
# Tokens usados: 1000+

# ✅ OTIMIZADO: processar LOCALMENTE
if problem_type == "CSS_bug" AND \
   problem_scope == "visual_only" AND \
   problem_risk == "low" THEN
  # Não precisa Claude, já sabe:
  "Risco baixo → faz PR direto"
  tokens_usados = 0
else
  # Só aí chama Claude
  claude.ask("Este problema é risco baixo ou médio/alto?")
  tokens_usados = 50
fi
```

**Economia:** -95% (70% dos problemas resolvido local)

---

## 5️⃣ Cache de decisões recentes

```bash
# Se viu o MESMO problema na última 1h:

if CACHE["problema_CSS_mobile"] exists AND \
   timestamp_agora - CACHE.timestamp < 3600 THEN
  # Reutiliza decisão (GRÁTIS)
  solution = CACHE["problema_CSS_mobile"].solucao
  tokens_usados = 0
else
  # Novo problema, chama Claude
  solution = claude.ask(...)
  # Guarda pra próxima vez
  CACHE["problema_CSS_mobile"] = {
    solucao: solution,
    timestamp: agora
  }
  tokens_usados = 500
fi
```

**Economia:** -40% (quando problema repete em curto período)

---

## 📊 Resultado combinado

| Situação | Sem otimização | Com otimização | Economia |
|----------|---|---|---|
| Ler dados | 2000 tokens | 200 tokens | -90% |
| Análise simples | 1000 tokens | 0 tokens | -100% |
| Decisões repetidas | 500 tokens | 0 tokens | -100% |
| Problema novo | 1000 tokens | 1000 tokens | 0% |
| **Total/execução** | **4500 tokens** | **1200 tokens** | **-73%** |

---

## 🔧 Implementar

1. Guardar `ULTIMA_EXECUCAO` em `WORKER-CACHE.json`
2. Usar timestamp em queries (`select(.createdAt > "$ULTIMA_EXECUCAO")`)
3. Filtrar PRs/issues localmente (não mandar lixo)
4. Cache de decisões (reutiliza em 1h)
5. Antes de chamar Claude, tentar local primeiro

**Resultado:** -70% tokens AQUI, sem VPS
