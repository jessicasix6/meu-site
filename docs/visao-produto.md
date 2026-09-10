# Visão de Produto — Top3Profissional

> **Este documento é a fonte da verdade da visão do produto.** Não é um plano de implementação — é onde a ideia mora, é consultada, e vai crescendo com o tempo. Antes de qualquer missão de implementação grande, ela nasce revisando este documento. Quando a visão mudar ou crescer, este arquivo é atualizado primeiro, e o código vem depois.

**Última atualização:** 2026-09-10 (criação do documento, a partir de uma conversa detalhada com a Jéssica descrevendo a visão completa pela primeira vez).

---

## 1. A ideia central, em uma frase

Um site com uma barra de busca única, estilo Google, onde qualquer pessoa descreve o que precisa numa frase — um serviço, um produto, uma corrida, um terreno, qualquer coisa — e um agente de IA não só acha o que já existe espalhado pela internet (inclusive em lugares pouco conhecidos que a pessoa nunca pensaria em procurar), como também conecta quem procura com quem oferece, em ambas as direções: quem tem pra oferecer publica, e quem não encontra o que quer também publica o que está procurando, formando um mercado vivo de oferta e demanda em qualquer categoria.

## 2. O problema que isso resolve

Hoje, se alguém quer um terreno barato numa região específica, ou uma corrida de um ponto a outro, ou um serviço de motoboy numa farmácia sem entregador disponível, essa pessoa precisa:
- Saber exatamente em qual site/app procurar (Mercado Livre? OLX? Facebook? um site regional pequeno que ela nem conhece?)
- Repetir a mesma busca em vários lugares diferentes
- Torcer pra que o que ela quer já esteja anunciado por alguém, porque não existe um jeito fácil de "avisar o mercado" que ela está procurando algo, caso ainda não exista

O Top3Profissional quer ser o lugar único que resolve os dois lados desse problema ao mesmo tempo: acha o que já existe, e dá um canal pra manifestar o que ainda não existe (virando um sinal pra quem pode oferecer).

## 3. Os pilares do produto

### 3.1 Barra de busca universal e adaptativa

- Uma única barra de busca, estilo Google, no topo do site — é o ponto de entrada principal pra tudo.
- A pessoa digita em linguagem natural ("manicure amanhã em BH", "terreno barato em Contagem", "corrida de Betim pra BH hoje à noite", "carro modelo Civic 2018").
- O agente de IA identifica o tipo de pedido e **muda a forma de apresentar o resultado** de acordo com a categoria — não é uma lista genérica sempre igual. Exemplos:
  - Serviço/profissional (manicure, eletricista): cards estilo o que já existe hoje no site, com nota, preço, distância.
  - Corrida (pessoa querendo ir de um lugar a outro): interface estilo BlaBlaCar — um mini-formulário de "de onde → pra onde", mostrando opções (carona, ônibus, moto, o que houver disponível).
  - Produto/imóvel (terreno, carro): cards com foto, preço, localização, link de origem.
- Resultado inicial: **as 3 melhores recomendações** (o "Top 3" que já é o nome do produto), com um botão "mostrar mais" pra expandir.
- **Filtros**: mais barato, mais perto (usa geolocalização do navegador, com permissão explícita da pessoa).

### 3.2 O loop de duas mãos: oferta + demanda, em qualquer categoria

Esse é o coração diferencial da ideia, mais importante que qualquer integração externa.

- Hoje o site já tem uma versão inicial disso, mas só pra corridas/entregas (o quadro de pedidos com "aceitar").
- A visão é **generalizar esse conceito pra qualquer categoria**: terreno, carro, serviço, o que for.
- Fluxo:
  1. Pessoa busca algo.
  2. Se já existe uma oferta compatível publicada por alguém (no próprio site, ou achada via busca externa) — mostra.
  3. Se não existe, ou mesmo se já existe, a pessoa pode **publicar um "interesse"** (uma demanda: "quero comprar/alugar/contratar X, nessas condições").
  4. Quem tem esse tipo de coisa pra oferecer — seja alguém que já estava pensando em vender, seja um prestador de serviço procurando trabalho — pode ver essas demandas publicadas e responder diretamente.
- Ou seja: o site não mostra só "quem publicou pra vender" — mostra também **o que as pessoas estão pedindo**, pro lado da oferta enxergar a demanda real do mercado antes mesmo dela virar um anúncio formal.
- Isso vale pra qualquer coisa: motoboys podem ver que uma farmácia sem entregador postou uma corrida pendente; alguém vendendo um terreno pode ver que teve 5 pessoas procurando terreno naquela região e nunca publicaram um anúncio formal em lugar nenhum.

### 3.3 Busca real na internet (não scraping) pra achar "achados escondidos"

- A ideia original era "varrer" sites como Mercado Livre e Facebook Marketplace automaticamente, inclusive sites pequenos e desconhecidos.
- **Decisão já tomada (ver seção 5): não fazer isso via scraping direto.** Scraping viola Termos de Uso das plataformas grandes, é tecnicamente frágil (elas bloqueiam ativamente) e traz risco jurídico real se o negócio crescer.
- **Caminho legítimo escolhido: usar uma API de busca na web de verdade** (ex: Brave Search API) pra que o agente de IA consiga achar conteúdo relevante espalhado pela internet — incluindo sites pequenos e pouco visitados que ninguém pensaria em checar — sem violar nada, porque é o mesmo princípio de um motor de busca normal (indexação pública).
- Custo conhecido: Brave Search API cobra **US$5 por 1.000 buscas** (perdeu o tier gratuito em fev/2026). Google Custom Search não é mais opção viável (não aceita clientes novos, será descontinuada em 2027).

### 3.4 Cross-posting pra Mercado Livre e OLX (integração oficial, opt-in)

- Mercado Livre e OLX **têm** plataformas de desenvolvedor oficiais (`developers.mercadolivre.com.br`, `developers.olx.com.br`), mas essas APIs são feitas pra quem **já vende lá** gerenciar os próprios anúncios — não pra um site de fora varrer o catálogo inteiro deles de graça.
- O Mercado Livre inclusive confirma que **não tem** API de afiliados aberta pra consultar produto/gerar link livremente.
- **Proposta de valor invertida, mas real:** em vez do Top3Profissional "puxar" anúncios de lá, a pessoa que publica algo no Top3Profissional pode **autorizar (via OAuth) que o mesmo anúncio seja publicado automaticamente também no Mercado Livre e/ou OLX** — publica uma vez, aparece em vários lugares. Isso é um baita incentivo pra quem anuncia usar o Top3Profissional como o ponto de partida.
- Facebook Marketplace **não tem** API pública equivalente — não há caminho oficial de integração com ele, nem pra ler nem pra publicar automaticamente. Fica de fora dessa parte por ora.

### 3.5 Módulo de corridas — "Uber/BlaBlaCar virtual"

- Pensado pra situações reais como: pessoa precisando de uma corrida, farmácia sem motoboy disponível, alguém oferecendo carona.
- Interface dedicada estilo BlaBlaCar: a pessoa só informa de onde → pra onde, e vê as opções disponíveis (carona de alguém, moto/motoboy, ônibus, etc.).
- Já existe uma primeira versão disso no site hoje (quadro de pedidos tipo "corrida"/"entrega" com aceitar) — a visão é expandir e dar uma cara própria de mini-app pra esse fluxo especificamente, incluindo a possibilidade de simular uma corrida mesmo que ela já exista publicada, e de farmácias/comércios postarem demanda de entregador ali junto com pessoas comuns.

### 3.6 Integração com WhatsApp

- Tudo isso — busca, publicar pedido/oferta, ver resultados — deve funcionar também via WhatsApp, não só no site.
- **Grupos de WhatsApp** com destaques periódicos (semanais/mensais) do que está bombando: novos pedidos, ofertas em destaque, etc. — uma forma de manter engajamento sem a pessoa precisar abrir o site toda hora.
- Quando há um "match" (alguém interessado em algo que outra pessoa publicou), e **se ambos permitirem**, o contato de WhatsApp é compartilhado e a conversa é redirecionada direto pro WhatsApp — o site é o motor de descoberta, mas a negociação final acontece onde as pessoas já estão confortáveis (o Zap).

### 3.7 Painel de ferramentas e benefícios gratuitos

- Uma seção curada com as melhores ferramentas/serviços que valem a pena (armazenamento em nuvem tipo Terabox, testes grátis de streaming, e outras categorias a pesquisar).
- **Não é compartilhamento de uma conta paga única** (isso violaria Termos de Uso de praticamente todo serviço que existe, e foi descartado — ver seção 5).
- É um botão "Conectar" por serviço: quando o serviço oferece OAuth/login social pra terceiros, é literalmente um clique; quando não oferece (caso comum em serviços menores como o Terabox), o botão leva a pessoa direto pra tela de cadastro do serviço, de forma facilitada — e, quando o serviço tiver programa de afiliados, o Top3Profissional pode ganhar uma comissão por cada cadastro, o que ajuda a sustentar o site.
- Cada pessoa sempre cria e usa a **própria conta individual** em cada serviço — nunca uma conta compartilhada.

## 4. Como isso se conecta com o que já existe no site hoje

O site atual (top3profissional.com.br) já tem, em produção:
- Busca por IA (Claude) sobre uma lista mock de prestadores de serviço, respondendo em linguagem natural.
- Ranking "Top 3" com nota, preço, distância.
- Alternância entre "Preciso de um serviço" (requisitante) e "Presto um serviço" (prestador).
- Quadro de pedidos abertos (corridas/entregas) com botão "aceitar", ainda em dados mock (em memória, não banco de verdade).
- Scaffold de integração com WhatsApp (webhook pronto, só falta credencial real da Meta).

Essa visão descrita aqui é uma **expansão** dessa base, não uma reconstrução do zero:
- A busca por IA precisa deixar de usar só dados mock e passar a consultar a internet de verdade (Brave Search API) além do que está publicado no próprio site.
- O conceito de "publicar pedido" (hoje só pra corrida/entrega) precisa virar genérico pra qualquer categoria.
- O "aceitar pedido" precisa virar um loop de match bidirecional (oferta ↔ demanda), com opção de compartilhar contato/WhatsApp.
- A integração com Mercado Livre/OLX, o painel de ferramentas gratuitas, e os grupos de WhatsApp com destaques são peças novas, ainda não iniciadas.

## 5. Decisões já tomadas (e por quê) — não reabrir sem motivo forte

Essas são conclusões a que já chegamos discutindo a ideia. Vale reler antes de propor algo que esbarre nelas:

| Decisão | Motivo |
|---|---|
| **Não fazer scraping direto** de Mercado Livre, OLX, Facebook Marketplace ou qualquer site pra "varredura geral" de anúncios | Viola Termos de Uso, tecnicamente frágil (bloqueio ativo), risco jurídico real se o negócio crescer |
| **Usar API de busca na web (Brave Search) em vez de scraping** pra achar conteúdo espalhado pela internet | Caminho 100% legítimo — mesmo princípio de um motor de busca — e ainda assim acha os "achados escondidos" que a ideia original queria |
| **Integração com Mercado Livre/OLX só via cross-posting oficial (OAuth, opt-in do próprio anunciante)**, nunca puxando o catálogo alheio | É o único uso permitido das APIs oficiais deles; puxar catálogo de terceiros sem autorização não tem caminho oficial |
| **Facebook Marketplace fica de fora** da integração automática por enquanto | Não existe API pública pra isso |
| **Nunca compartilhar uma única conta paga (streaming, storage) entre vários usuários** | Viola Termos de Uso de praticamente todo serviço de assinatura que existe; risco de banimento constante e, em escala, risco jurídico |
| **Painel de benefícios = cada pessoa cria a própria conta individual**, com atalho/afiliado, nunca conta compartilhada | Forma legítima de entregar o mesmo valor (acesso fácil a ferramentas boas) sem o risco acima |

## 6. Custos conhecidos até agora (a atualizar conforme formos descobrindo mais)

- **Brave Search API**: US$5 por 1.000 buscas (busca), ou ~US$4/1.000 + tokens (modo "Answers"). Sem tier gratuito desde fev/2026.
- **Claude API** (já em uso hoje): cobrança por uso, já configurada e rodando.
- Custos de hospedagem, domínio, etc.: já cobertos em outra parte do projeto (VPS Hostinger + backup no PC), não repetidos aqui.
- **Ainda não pesquisado**: custo de eventuais comissões/parcerias de afiliados (tendem a ser receita, não custo, mas precisa confirmar termos de cada programa quando chegarmos lá).

## 7. Perguntas em aberto (pra decidir quando formos transformar isso em missão de implementação)

- Por qual pilar começar? (Sugestão inicial dada na conversa: generalizar o "publicar pedido" pra qualquer categoria primeiro, por não depender de nenhuma integração externa incerta — mas isso é uma sugestão, não uma decisão fechada.)
- Qual o orçamento mensal aceitável pra a Brave Search API, já que o custo cresce com o tráfego?
- Quais categorias de "ferramentas/benefícios grátis" entram primeiro no painel? (armazenamento, streaming, outras)
- Como fica a UX exata da troca de contato/redirecionamento pro WhatsApp — some quando? A pessoa aprova cada vez ou só uma vez por conta?
- Detalhes de moderação/segurança: como evitar spam de "pedidos" falsos ou anúncios golpe, já que agora qualquer categoria pode ser publicada.

---

*Este arquivo deve crescer com o tempo. Qualquer ideia nova, ajuste de direção, ou decisão tomada numa conversa deve ser adicionada aqui antes de virar código.*
