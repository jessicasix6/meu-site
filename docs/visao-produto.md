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

## 3. Princípios estratégicos (inspirados em "A Arte da Guerra", sugestão da Jéssica, 2026-09-10)

A Jéssica sugeriu usar "A Arte da Guerra" (Sun Tzu) como parte da fonte da verdade. O texto completo (tradução própria, domínio público) está em [`docs/a-arte-da-guerra.md`](a-arte-da-guerra.md). Aqui embaixo, a tradução prática de alguns princípios do livro pra decisões concretas do produto — é um negócio entrando num mercado onde já existem gigantes (Mercado Livre, OLX, Uber, iFood):

- **"Vencer sem lutar" — não competir de frente com quem já domina.** Não faz sentido tentar ser "melhor Mercado Livre que o Mercado Livre" ou "melhor Uber que o Uber". A vantagem do Top3Profissional é achar os espaços que os grandes não cobrem bem: o terreno num site pequeno que ninguém indexa, o motoboy que a farmácia do bairro precisa agora, o pedido de quem não sabia nem por onde procurar. Isso já está refletido na escolha de usar busca na web (seção 4.3) em vez de brigar por catálogo próprio com quem já tem milhões de anúncios.
- **"Conheça o inimigo e conheça a si mesmo" — ser honesto sobre o que ainda não temos.** Este documento (seção 6) já lista o que decidimos não fazer e por quê (scraping, contas compartilhadas). Continuar sendo honesto sobre limitação atual (sem conta de usuário, sem pagamento na plataforma ainda) é mais seguro que fingir uma robustez que não existe.
- **"Ataque onde o inimigo está despreparado" — priorizar nichos carentes, não os mais disputados.** Categorias onde grandes players têm cobertura fraca (serviços informais locais, pedidos hiper-específicos tipo "corrida de tal lugar pra tal lugar hoje à noite") valem mais esforço agora do que tentar competir em categorias já saturadas (ex: venda de eletrônico novo, onde Mercado Livre e Amazon dominam de forma difícil de superar).
- **Velocidade e adaptação continuam valendo mais que perfeição.** Já é o padrão deste projeto desde o início (provar o ciclo básico antes de automatizar, lançar mock antes de integração real) — Sun Tzu reforça a mesma lógica: uma posição imperfeita hoje vale mais que uma perfeita tarde demais.
- **Terreno importa — o "terreno" aqui é o Brasil local e informal.** A força real do produto está em regiões e categorias onde a informalidade é alta e a cobertura dos apps grandes é fraca — não em tentar replicar a escala deles.
- **Fazer aliado do inimigo em vez de só combatê-lo** (sugestão da Jéssica, 2026-09-10). Nem todo concorrente grande precisa ser tratado como ameaça pura — às vezes o movimento mais esperto é virar parceiro. Isso já está concretamente desenhado no cross-posting pro Mercado Livre e OLX (seção 4.4): em vez de brigar pelo catálogo deles, o Top3Profissional deixa quem anuncia aqui publicar lá também, automaticamente. O "inimigo" (a escala deles) vira uma distribuição extra pra quem usa o nosso site.
- **"O inimigo do meu inimigo é meu amigo"** (variação trazida pela Jéssica, 2026-09-10). Vale olhar pra quem também está competindo contra os mesmos gigantes (outras plataformas locais pequenas, associações de motoboys/prestadores independentes) como possíveis parceiros de distribuição ou divulgação, não como concorrentes do Top3Profissional — o adversário comum é a escala do Mercado Livre/Uber/iFood, não esses outros pequenos players. Ainda não tem nenhuma parceria concreta desenhada — fica registrado aqui como direção a explorar, não como decisão fechada.

**Como aplicar:** antes de decidir competir de frente com um concorrente grande numa funcionalidade específica, parar e perguntar "isso é vencer sem lutar, ou é brigar onde o inimigo é mais forte?". Se for a segunda opção, provavelmente vale reconsiderar o ângulo.

## 4. Os pilares do produto

### 4.1 Barra de busca universal e adaptativa

- Uma única barra de busca, estilo Google, no topo do site — é o ponto de entrada principal pra tudo.
- A pessoa digita em linguagem natural ("manicure amanhã em BH", "terreno barato em Contagem", "corrida de Betim pra BH hoje à noite", "carro modelo Civic 2018").
- O agente de IA identifica o tipo de pedido e **muda a forma de apresentar o resultado** de acordo com a categoria — não é uma lista genérica sempre igual. Exemplos:
  - Serviço/profissional (manicure, eletricista): cards estilo o que já existe hoje no site, com nota, preço, distância.
  - Corrida (pessoa querendo ir de um lugar a outro): interface estilo BlaBlaCar — um mini-formulário de "de onde → pra onde", mostrando opções (carona, ônibus, moto, o que houver disponível).
  - Produto/imóvel (terreno, carro): cards com foto, preço, localização, link de origem.
- Resultado inicial: **as 3 melhores recomendações** (o "Top 3" que já é o nome do produto), com um botão "mostrar mais" pra expandir.
- **Filtros**: mais barato, mais perto (usa geolocalização do navegador, com permissão explícita da pessoa).

### 4.2 O loop de duas mãos: oferta + demanda, em qualquer categoria

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

### 4.3 Busca real na internet (não scraping) pra achar "achados escondidos"

- A ideia original era "varrer" sites como Mercado Livre e Facebook Marketplace automaticamente, inclusive sites pequenos e desconhecidos.
- **Decisão já tomada (ver seção 6): não fazer isso via scraping direto.** Scraping viola Termos de Uso das plataformas grandes, é tecnicamente frágil (elas bloqueiam ativamente) e traz risco jurídico real se o negócio crescer.
- **Caminho legítimo escolhido: usar uma API de busca na web de verdade** (ex: Brave Search API) pra que o agente de IA consiga achar conteúdo relevante espalhado pela internet — incluindo sites pequenos e pouco visitados que ninguém pensaria em checar — sem violar nada, porque é o mesmo princípio de um motor de busca normal (indexação pública).
- Custo conhecido: Brave Search API cobra **US$5 por 1.000 buscas** (perdeu o tier gratuito em fev/2026). Google Custom Search não é mais opção viável (não aceita clientes novos, será descontinuada em 2027).

### 4.4 Cross-posting pra Mercado Livre e OLX (integração oficial, opt-in)

- Mercado Livre e OLX **têm** plataformas de desenvolvedor oficiais (`developers.mercadolivre.com.br`, `developers.olx.com.br`), mas essas APIs são feitas pra quem **já vende lá** gerenciar os próprios anúncios — não pra um site de fora varrer o catálogo inteiro deles de graça.
- O Mercado Livre inclusive confirma que **não tem** API de afiliados aberta pra consultar produto/gerar link livremente.
- **Proposta de valor invertida, mas real:** em vez do Top3Profissional "puxar" anúncios de lá, a pessoa que publica algo no Top3Profissional pode **autorizar (via OAuth) que o mesmo anúncio seja publicado automaticamente também no Mercado Livre e/ou OLX** — publica uma vez, aparece em vários lugares. Isso é um baita incentivo pra quem anuncia usar o Top3Profissional como o ponto de partida.
- Facebook Marketplace **não tem** API pública equivalente — não há caminho oficial de integração com ele, nem pra ler nem pra publicar automaticamente. Fica de fora dessa parte por ora.

### 4.5 Módulo de corridas — "Uber/BlaBlaCar virtual"

- Pensado pra situações reais como: pessoa precisando de uma corrida, farmácia sem motoboy disponível, alguém oferecendo carona.
- Interface dedicada estilo BlaBlaCar: a pessoa só informa de onde → pra onde, e vê as opções disponíveis (carona de alguém, moto/motoboy, ônibus, etc.).
- Já existe uma primeira versão disso no site hoje (quadro de pedidos tipo "corrida"/"entrega" com aceitar) — a visão é expandir e dar uma cara própria de mini-app pra esse fluxo especificamente, incluindo a possibilidade de simular uma corrida mesmo que ela já exista publicada, e de farmácias/comércios postarem demanda de entregador ali junto com pessoas comuns.

### 4.6 Integração com WhatsApp — o site "dentro" do chat

- Tudo isso — busca, publicar pedido/oferta, ver resultados — deve funcionar também via WhatsApp, não só no site. A visão (2026-09-10, detalhada): **a maioria das funções do site deve rodar direto no WhatsApp**, com um agente/robô do Top3Profissional integrado ao chat; só quando alguma coisa realmente não der pra fazer em texto/botões do WhatsApp é que redireciona a pessoa pro navegador.
- **Grupos de WhatsApp** com destaques periódicos (semanais/mensais) do que está bombando: novos pedidos, ofertas em destaque, etc. — uma forma de manter engajamento sem a pessoa precisar abrir o site toda hora.
- **Compartilhamento de contato em match**: quando há um match (alguém interessado em algo que outra pessoa publicou), o contato de WhatsApp é compartilhado e a conversa é redirecionada direto pro WhatsApp — o site é o motor de descoberta, mas a negociação final acontece onde as pessoas já estão confortáveis (o Zap). Regra de permissão (decidida em 2026-09-10):
  - A pessoa **aprova uma única vez** (não pergunta de novo a cada match).
  - Essa aprovação vira um **botão liga/desliga nas configurações do site/painel**, que ela pode mudar quando quiser.
  - Controla a exibição do número tanto quando ela **publica um interesse** (demanda) quanto quando ela **publica um serviço/oferta** — mesmo toggle pros dois casos.

### 4.7 Painel de ferramentas e benefícios gratuitos

- Uma seção curada com as melhores ferramentas/serviços que valem a pena. **Ponto de partida definido (2026-09-10): Terabox entra primeiro, em destaque (posição 1 do ranking)**; Mega e outras opções entram como sugestões adicionais.
- É um processo **contínuo**, não uma lista fechada: conforme forem lançando coisas novas e interessantes, a ideia é sempre estar pesquisando e trazendo pro público — o painel deve crescer com o tempo, não ser montado uma vez só.
- **Não é compartilhamento de uma conta paga única** (isso violaria Termos de Uso de praticamente todo serviço que existe, e foi descartado — ver seção 6).
- É um botão "Conectar" por serviço: quando o serviço oferece OAuth/login social pra terceiros, é literalmente um clique; quando não oferece (caso comum em serviços menores como o Terabox), o botão leva a pessoa direto pra tela de cadastro do serviço, de forma facilitada — e, quando o serviço tiver programa de afiliados, o Top3Profissional pode ganhar uma comissão por cada cadastro, o que ajuda a sustentar o site.
- Cada pessoa sempre cria e usa a **própria conta individual** em cada serviço — nunca uma conta compartilhada.

### 4.8 Assinatura premium pro prestador (destaque pago) — monetização do site

- **Ideia nova (2026-09-10):** prestadores de serviço podem pagar uma assinatura (ou testar um período premium) pra **destacar** o próprio serviço nos resultados de busca — aparecer com mais visibilidade que quem não pagou.
- É a primeira fonte de receita direta do site descrita na visão (além de eventuais comissões de afiliados do painel de benefícios, seção 4.7).
- Ainda em aberto: quanto custa, o que exatamente muda visualmente pra quem é destaque, se tem nível único ou vários níveis de destaque. Ver seção 8.

### 4.9 Agendamento e painel de lucros pro prestador (via WhatsApp)

- **Ideia nova (2026-09-10):** depois que o prestador assina o premium (ou testa), o robô do WhatsApp passa a ajudar ela a:
  - **Agendar clientes** — controlar horários/compromissos direto pelo chat.
  - **Ver os próprios lucros** — um resumo/painel de quanto ela ganhou através do site.
- Isso é uma camada de "ferramenta de negócio" pro prestador, em cima do que já é o mercado de encontrar cliente — não é só divulgação, é gestão do dia a dia dela.
- Ainda em aberto: se esse recurso fica exclusivo de quem paga o premium, ou se uma versão básica (ex: agendamento simples) fica disponível pra todo mundo e só o "ver lucros" fica premium. Ver seção 8.

### 4.10 Pagamento dentro da plataforma (segurança + possível monetização)

- **Ideia nova (2026-09-10), nasceu como resposta ao "como evitar golpe":** sugerir que o pagamento aconteça **dentro da própria plataforma** em vez de por fora, como camada de segurança pra quem compra/contrata (some com o risco de golpe tipo "combinei um valor, a pessoa sumiu depois de receber o PIX").
- **Modelo escolhido (2026-09-10), referência: retenção do Mercado Livre/Mercado Pago** — a plataforma **retém o dinheiro** até a conclusão confirmada do serviço/entrega, e pode devolver pra quem pagou se a pessoa desistir ou o serviço não acontecer como combinado. É o mesmo princípio de proteção ao comprador que o Mercado Livre usa.
- **Atenção — isso é um pilar bem mais pesado do que parece à primeira vista.** Processar pagamento de verdade dentro da plataforma não é só uma tela nova: normalmente exige integrar um gateway de pagamento já regulamentado (ex: Mercado Pago, PagSeguro, Asaas, Stripe), decidir como funciona a custódia do dinheiro até a entrega/confirmação do serviço (modelo tipo "escrow", que é exatamente o que foi descrito acima), e seguir as regras do Banco Central pra intermediação de pagamentos no Brasil. Não é algo pra tratar como detalhe dentro de "evitar golpe" — merece ser tratado como projeto à parte, com calma, quando chegarmos nele.
- Enquanto isso não existe, a mitigação de golpe é só orientação (ver seção 4.11 abaixo).

### 4.11 Segurança contra golpes (enquanto não existe pagamento na plataforma)

- **Decidido em 2026-09-10:** orientar as pessoas a se encontrarem em **local público e movimentado** pra negociações presenciais, e sugerir (não ainda obrigar, já que o pagamento na plataforma — seção 4.10 — não existe ainda) que o pagamento aconteça dentro da plataforma quando possível.
- **Avaliação e indicação pós-serviço (2026-09-10), referência: sistema de avaliação do BlaBlaCar** — depois que um serviço é **realmente concluído** (não uma avaliação solta, sem transação de verdade por trás), quem contratou pode avaliar e indicar o prestador. Isso constrói reputação real ao longo do tempo — um prestador com várias avaliações genuínas de serviços concluídos passa confiança muito maior que um anúncio novo sem histórico, e ajuda a combater golpe (perfil golpista não acumula avaliação real).
  - Em aberto: como o site confirma que o serviço foi "de verdade" concluído antes de liberar a avaliação (ex: as duas partes confirmam, ou fica vinculado ao pagamento na plataforma quando esse pilar existir — seção 4.10)? Ver seção 8.
- Outras ideias de segurança (verificação de identidade, denúncia de anúncio suspeito) ainda não foram detalhadas — ficam como ponto a desenvolver mais.

## 5. Como isso se conecta com o que já existe no site hoje

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

## 6. Decisões já tomadas (e por quê) — não reabrir sem motivo forte

Essas são conclusões a que já chegamos discutindo a ideia. Vale reler antes de propor algo que esbarre nelas:

| Decisão | Motivo |
|---|---|
| **Não fazer scraping direto** de Mercado Livre, OLX, Facebook Marketplace ou qualquer site pra "varredura geral" de anúncios | Viola Termos de Uso, tecnicamente frágil (bloqueio ativo), risco jurídico real se o negócio crescer |
| **Usar API de busca na web (Brave Search) em vez de scraping** pra achar conteúdo espalhado pela internet | Caminho 100% legítimo — mesmo princípio de um motor de busca — e ainda assim acha os "achados escondidos" que a ideia original queria |
| **Integração com Mercado Livre/OLX só via cross-posting oficial (OAuth, opt-in do próprio anunciante)**, nunca puxando o catálogo alheio | É o único uso permitido das APIs oficiais deles; puxar catálogo de terceiros sem autorização não tem caminho oficial |
| **Facebook Marketplace fica de fora** da integração automática por enquanto | Não existe API pública pra isso |
| **Nunca compartilhar uma única conta paga (streaming, storage) entre vários usuários** | Viola Termos de Uso de praticamente todo serviço de assinatura que existe; risco de banimento constante e, em escala, risco jurídico |
| **Painel de benefícios = cada pessoa cria a própria conta individual**, com atalho/afiliado, nunca conta compartilhada | Forma legítima de entregar o mesmo valor (acesso fácil a ferramentas boas) sem o risco acima |

## 7. Custos conhecidos até agora (a atualizar conforme formos descobrindo mais)

- **Orçamento máximo definido pela Jéssica (2026-09-10): R$50/mês inicialmente** pra custos de busca/IA além do que já existe. Qualquer decisão de arquitetura nessa área precisa caber nesse teto.
- **Brave Search API**: US$5 por 1.000 buscas (busca), ou ~US$4/1.000 + tokens (modo "Answers"). Sem tier gratuito desde fev/2026.
- **Claude API** (já em uso hoje): cobrança por uso, já configurada e rodando.
- **Ideia a avaliar (2026-09-10): alternar automaticamente entre Grok (xAI) e Claude** — motivo provável é custo (Grok pode ser mais barato pra certas tarefas) e/ou o Grok ter acesso a busca em tempo real embutido (via integração com o X/Twitter), o que talvez reduza ou substitua a necessidade da Brave Search API. Ainda não pesquisado a fundo — fica como item da seção 8.
- Custos de hospedagem, domínio, etc.: já cobertos em outra parte do projeto (VPS Hostinger + backup no PC), não repetidos aqui.
- **Ainda não pesquisado**: custo de eventuais comissões/parcerias de afiliados (tendem a ser receita, não custo, mas precisa confirmar termos de cada programa quando chegarmos lá); custo de gateway de pagamento (seção 4.10) quando chegarmos nele.

## 8. Perguntas em aberto (pra decidir quando formos transformar isso em missão de implementação)

*(Resolvidas em 2026-09-10, removidas daqui e incorporadas nas seções acima: orçamento da API de busca, ponto de partida do painel de benefícios (Terabox), aprovação de contato do WhatsApp, e a estratégia geral anti-golpe.)*

- **Por qual pilar começar a implementação?** A Jéssica pediu explicitamente pra eu decidir e justificar (2026-09-10) — ver a recomendação na seção 9, abaixo.
- ~~Grok vs Claude, alternância automática~~ — **resolvido (2026-09-10): não compensa.** O "Web Search" da própria API do Grok custa exatamente o mesmo que a Brave Search API (US$5 por 1.000 chamadas) — trocar de provedor não reduz esse custo específico, só adiciona a complexidade de manter dois provedores de IA diferentes sem ganho real. Decisão: seguir só com Claude + Brave Search API.
- **Assinatura premium (seção 4.8)**: quanto custa, o que muda visualmente pra quem é destaque, se tem um nível só ou vários.
- **Agendamento e lucros via WhatsApp (seção 4.9)**: fica tudo exclusivo de quem paga o premium, ou uma versão básica (ex: agendamento simples) fica de graça pra todo prestador e só "ver lucros" é premium?
- **Pagamento na plataforma / retenção estilo Mercado Livre (seção 4.10)**: qual gateway usar (Mercado Pago, Asaas, Stripe, etc.), como funciona a liberação/devolução do valor retido, e como isso se conecta com as regras do Banco Central pra intermediação de pagamento no Brasil. Fica pra tratar como projeto à parte quando chegarmos nele.
- **Confirmação de serviço concluído (seção 4.11)**: como o site sabe que o serviço realmente aconteceu antes de liberar a avaliação — as duas partes confirmam manualmente, ou isso fica amarrado à liberação do pagamento retido (seção 4.10)?
- Detalhes de moderação/segurança adicionais: verificação de identidade, denúncia de anúncio suspeito — ainda não detalhado.

## 9. Recomendação de sequência de implementação (Claude, 2026-09-10)

A Jéssica pediu explicitamente pra eu decidir por qual pilar começar, já com acesso ao código e contexto do projeto. Minha recomendação, em ordem, com o motivo de cada posição:

1. **Generalizar o loop de oferta+demanda (pilar 4.2) pra qualquer categoria.** Primeiro porque é **de graça** — não depende de nenhuma API paga, gateway de pagamento, ou bot de WhatsApp — cabe folgado no orçamento de R$50/mês sem gastar nada dele. Segundo porque é literalmente "o coração diferencial da ideia" (nas palavras do próprio documento, seção 4.2) — faz sentido provar que esse mecanismo funciona e engaja as pessoas antes de investir em qualquer coisa mais cara em cima dele. Terceiro porque já existe uma versão dele rodando pra corridas — é extensão de algo que já funciona, não construção do zero, o que reduz risco.
2. **Busca real na web (pilar 4.3)**, mas só depois de decidir Grok vs Claude+Brave Search (pergunta em aberto na seção 8) — é o próximo item mais barato e que já expande bastante o valor pra quem busca, sem exigir nenhuma integração de pagamento ou aprovação de parceiro externo.
3. **Painel de benefícios grátis com Terabox (pilar 4.7).** Baixo custo de construção (é basicamente uma lista curada + botões de link), e pode começar a gerar receita de afiliado cedo, o que ajuda a bancar os próximos passos mais caros.
4. **WhatsApp básico — busca e publicar pelo chat (parte do pilar 4.6).** Complexidade média (o scaffold do webhook já existe no projeto), mas ainda não depende de pagamento nem de assinatura premium.
5. **Assinatura premium / destaque pago (pilar 4.8).** Só faz sentido depois de ter tráfego e pedidos reais rolando no site — vender destaque antes de ter audiência pra ver esse destaque não tem valor pra quem compraria.
6. **Agendamento e painel de lucros via WhatsApp (pilar 4.9).** Depende do premium (item 5) já existir como conceito, já que é a ferramenta que justifica a assinatura continuar sendo paga.
7. **Cross-posting Mercado Livre/OLX (pilar 4.4).** Deixo mais pra frente porque depende de aprovação/parceria de desenvolvedor nessas plataformas — processo fora do nosso controle direto de tempo.
8. **Pagamento na plataforma com retenção (pilar 4.10) e avaliação pós-serviço amarrada a ele (pilar 4.11).** De propósito por último — é o pilar mais regulado e caro de errar (envolve dinheiro de verdade e regras do Banco Central), então só faz sentido investir nisso quando o site já tiver volume real de transações acontecendo por fora, provando que vale a pena trazer pra dentro.

**Resumindo o critério usado:** primeiro o que não custa nada e prova a ideia central; depois o que custa pouco e já expande valor; monetização só depois de ter audiência real; e o que envolve dinheiro/regulação de verdade por último, com calma.

---

*Este arquivo deve crescer com o tempo. Qualquer ideia nova, ajuste de direção, ou decisão tomada numa conversa deve ser adicionada aqui antes de virar código.*
