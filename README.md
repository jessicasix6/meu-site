# meu-site

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
