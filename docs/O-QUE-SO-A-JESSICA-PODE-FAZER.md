# O que só você pode fazer

Três coisas. A 1 e a 2 destravam o worker; a 3 é o que o faz trabalhar.
**Nessa ordem** — fazer a 3 antes das outras duas não produz nada.

---

## Passo 1 — Conectar o repositório à rotina

**Por que:** a rotina tentou ler o GitHub e recebeu erro 403 com a mensagem
*"GitHub access to this repository is not enabled for this session"*. Sem isso
ela não consegue abrir sugestão, escrever no diário nem registrar o batimento.

**Onde:** nas configurações da rotina agendada, na sua conta do Claude — a
mesma tela onde você criou a rotina "TOP3 worker". Procure a parte que trata
de repositório ou de acesso ao GitHub.

**O que fazer:** conectar o repositório `jessicasix6/meu-site`.

**Como saber se deu certo:** na próxima execução, a rotina para de dizer
"GitHub access is not enabled".

---

## Passo 2 — Liberar o domínio do site

**Por que:** a rotina tentou abrir `top3profissional.com.br/health` e o
bloqueio de rede da organização recusou. Sem isso ela não verifica o site —
fica cega justamente para o trabalho dela.

**Onde:** nas configurações de **organização** da sua conta Claude, na parte
de política de rede / domínios permitidos. Não é no repositório, é na conta.

**O que fazer:** adicionar `top3profissional.com.br` à lista de domínios
permitidos.

**Observação:** esse mesmo bloqueio já tinha derrubado uma tentativa anterior
em setembro (o `worker-api.js`, removido no PR #11). É a mesma trava.

---

## Passo 3 — Colar o prompt na rotina

**Só depois dos passos 1 e 2.**

**Qual arquivo:** `docs/PROMPT-DO-AGENTE.txt` — esse é só o prompt, sem
explicação em volta. Seleciona tudo e copia.

**NÃO use** o `docs/agente-rotina.md`: aquele é a explicação de como funciona,
e coladas juntas viram instrução confusa pro agente.

**Onde colar:** na rotina **"TOP3 worker"**, substituindo o prompt atual.

**Atenção:** a issue #95 diz que o prompt dessa rotina foi criado pela API, e
por isso nenhuma sessão do Claude consegue editá-lo — tem que ser na mão, por
você, na interface.

**Como saber se deu certo:** em até uma hora aparece um comentário novo na
issue #98, e o corpo da issue #95 ganha uma linha com data e hora.

---

## Depois disso

Se passar 90 minutos sem o agente dar sinal, o vigia comenta na #95 marcando
você — e o GitHub te manda e-mail. Esse vigia roda no GitHub Actions, não na
rotina, então ele funciona mesmo que a rotina esteja quebrada. É de propósito:
quem vigia não pode depender do vigiado.

---

# O que fica pendente pra depois

Coisas que a gente decidiu adiar, não esquecer:

- **Aposentar a rotina "Vigia do worker TOP3"** — ela reportou que não enxerga
  nada, e o vigia do Actions faz o trabalho dela com acesso de verdade
- **Confirmar se o VPS tem backup automático** — se tiver, o histórico cru
  precisa ficar fora dele, senão a promessa de apagar em 60 dias não vale
- **WhatsApp para alertas** — exige cadastro no Meta e modelo de mensagem
  aprovado, por causa da regra das 24 horas
- **Cache do site** — o service worker serviu versão antiga depois do deploy
  mesmo com recarregamento forçado; enganou até a mim. Vale versionar o nome
  do cache a cada publicação
