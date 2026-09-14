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
  - Corrida (pessoa querendo ir de um lugar a outro): interface de corrida/carona compartilhada — um mini-formulário de "de onde → pra onde", mostrando opções (carona, ônibus, moto, o que houver disponível).
  - Produto/imóvel (terreno, carro): cards com foto, preço, localização, link de origem.
- Resultado inicial: **as 3 melhores recomendações** (o "Top 3" que já é o nome do produto), com um botão "mostrar mais" pra expandir.
- **Filtros**: mais barato, mais perto (usa geolocalização do navegador, com permissão explícita da pessoa).
- **Melhoria (2026-09-14, pedido da Jéssica):** placeholder da barra muda por modo — "Descreva o que você gostaria de solicitar..." no modo "Solicito serviço" (o padrão), texto diferente no modo "Presto serviço". O hero também ganhou uma linha de "Exemplos" clicáveis (manicure, eletricista, terreno, corrida, carro usado) pra quem chega no site sem saber o que digitar — clicar preenche e dispara a mesma busca de sempre, sem formulário novo (princípio da seção 10: um controle por ação).

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
- **Status (2026-09-14): publicar/aceitar pedido em qualquer categoria já funciona** (corrida, entrega, terreno, carro, produto, outro — campo "Tipo" livre no formulário, validado igual pra todas). O que faltava era a parte mais nova da ideia: **demanda que ninguém publicou formalmente também virar sinal visível**. Implementado como "Gente andou procurando isso, sem achar" — uma seção no modo "Presto serviço" (depois do quadro de pedidos abertos). Toda busca em texto livre que cai fora do catálogo estruturado (nem serviço cadastrado, nem corrida/carona — ver seção 10) já é, por construção, o tipo de busca que interessa aqui; o servidor classifica por palavra-chave numa categoria (terreno, imóvel, carro, produto), tenta extrair uma região ("em Contagem"), e agrega por categoria+região. Decisões de privacidade: nunca guarda o texto exato digitado, só categoria/região/contagem; só vira sinal público com no mínimo 2 ocorrências (uma busca isolada não aparece); "quero chamar X" (contatar quem já está no ranking) nunca conta como demanda, só busca de verdade sem oferta correspondente.

### 4.3 Busca real na internet (não scraping) pra achar "achados escondidos"

- A ideia original era "varrer" sites como Mercado Livre e Facebook Marketplace automaticamente, inclusive sites pequenos e desconhecidos.
- **Decisão já tomada (ver seção 6): não fazer isso via scraping direto.** Scraping viola Termos de Uso das plataformas grandes, é tecnicamente frágil (elas bloqueiam ativamente) e traz risco jurídico real se o negócio crescer.
- **Caminho legítimo escolhido: usar uma API de busca na web de verdade** (ex: Brave Search API) pra que o agente de IA consiga achar conteúdo relevante espalhado pela internet — incluindo sites pequenos e pouco visitados que ninguém pensaria em checar — sem violar nada, porque é o mesmo princípio de um motor de busca normal (indexação pública).
- Custo conhecido: Brave Search API cobra **US$5 por 1.000 buscas** (perdeu o tier gratuito em fev/2026). Google Custom Search não é mais opção viável (não aceita clientes novos, será descontinuada em 2027).
- **Status (2026-09-14): trocado pra SearXNG, autohospedado, grátis.** Decisão da Jéssica de cortar custo — pesquisei a busca nativa da própria Anthropic como alternativa (US$10/1.000 buscas, o dobro da Brave, não compensava) antes de chegar no SearXNG (motor de busca open-source, roda em Docker, sem chave, sem custo por busca, agrega resultado de vários motores). Testado local (no notebook da Jéssica) com buscas reais — resultados relevantes confirmados (ex: "terreno barato em Contagem" trouxe anúncios reais de OLX/Imovelweb/VivaReal). Arquitetura: `SEARXNG_URL` é o caminho **preferido** agora; `BRAVE_SEARCH_API_KEY` vira só um fallback pago, usado automaticamente apenas se o SearXNG não estiver configurado ou falhar — custo zero enquanto o SearXNG estiver saudável. Rodando só localmente por enquanto (decisão da Jéssica, 2026-09-14) — pra virar busca de verdade pro site em produção, precisa subir a mesma instância no VPS (ver seção 7, ponto em aberto sobre isso).

### 4.4 Cross-posting pra Mercado Livre e OLX (integração oficial, opt-in)

- Mercado Livre e OLX **têm** plataformas de desenvolvedor oficiais (`developers.mercadolivre.com.br`, `developers.olx.com.br`), mas essas APIs são feitas pra quem **já vende lá** gerenciar os próprios anúncios — não pra um site de fora varrer o catálogo inteiro deles de graça.
- O Mercado Livre inclusive confirma que **não tem** API de afiliados aberta pra consultar produto/gerar link livremente.
- **Proposta de valor invertida, mas real:** em vez do Top3Profissional "puxar" anúncios de lá, a pessoa que publica algo no Top3Profissional pode **autorizar (via OAuth) que o mesmo anúncio seja publicado automaticamente também no Mercado Livre e/ou OLX** — publica uma vez, aparece em vários lugares. Isso é um baita incentivo pra quem anuncia usar o Top3Profissional como o ponto de partida.
- Facebook Marketplace **não tem** API pública equivalente — não há caminho oficial de integração com ele, nem pra ler nem pra publicar automaticamente. Fica de fora dessa parte por ora.
- **Checado de novo em 2026-09-11** (a Jéssica perguntou se dava pra usar essas APIs pra *buscar* nos sites deles ao mesmo tempo, não só cross-posting): Mercado Livre até documenta um endpoint de busca pública (`/sites/MLB/search`), mas relatos recentes de vários desenvolvedores mostram ele retornando erro 403 (bloqueado) mesmo com token válido — instável demais pra depender dele agora. OLX confirmado: a API deles é só pra quem já anuncia lá gerenciar/importar os próprios anúncios (OAuth do anunciante), sem endpoint de busca pública nenhum. Conclusão: a decisão desta seção continua valendo — nada de puxar catálogo alheio pra dentro da busca; a busca por produto/item continua pelo Brave Search (seção 4.3), que é estável e já está orçado.

### 4.5 Módulo de corridas — mini-app de corrida/carona compartilhada

- Pensado pra situações reais como: pessoa precisando de uma corrida, farmácia sem motoboy disponível, alguém oferecendo carona.
- Interface dedicada de corrida/carona compartilhada: a pessoa só informa de onde → pra onde, e vê as opções disponíveis (carona de alguém, moto/motoboy, ônibus, etc.).
- Já existe uma primeira versão disso no site hoje (quadro de pedidos tipo "corrida"/"entrega" com aceitar) — a visão é expandir e dar uma cara própria de mini-app pra esse fluxo especificamente, incluindo a possibilidade de simular uma corrida mesmo que ela já exista publicada, e de farmácias/comércios postarem demanda de entregador ali junto com pessoas comuns.
- **Status (2026-09-14): mini-app "de → pra" agora cobre corrida/carona E entrega, com um alternador (evita duplicar a seção inteira, ver princípios de UI/UX na seção 10).** Antes, a busca "de → pra" só encontrava pedidos tipo "corrida" — o cenário explícito do exemplo acima (farmácia sem motoboy) nunca aparecia nessa busca, mesmo já existindo no quadro de pedidos geral. Corrigido: alternador "Corrida/carona" / "Entrega" no topo do mini-app, filtra e publica no tipo certo. "Simular uma corrida mesmo que já exista publicada" já funcionava (botão "Publicar" sempre aparece, junto com os resultados existentes, não em vez deles) — confirmado, sem mudança necessária.

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
- **Status (2026-09-14): 2 ferramentas novas adicionadas** (pesquisadas e verificadas antes de entrar — ver seção 6, nada de indicar algo sem checar). **Canva** (editor de imagens grátis pra panfleto/post/cartão de visita — plano grátis confirmado, sem cartão, sem prazo) e **Recibo Gratuito** (gera recibo em PDF pra cliente, sem cadastro nem propaganda — verificado que não tem cobrança escondida). Painel continua um processo contínuo, sempre aberto a mais adições.

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
- **Avaliação e indicação pós-serviço (2026-09-10), referência: sistemas de avaliação pós-transação de apps de caronas/serviços** — depois que um serviço é **realmente concluído** (não uma avaliação solta, sem transação de verdade por trás), quem contratou pode avaliar e indicar o prestador. Isso constrói reputação real ao longo do tempo — um prestador com várias avaliações genuínas de serviços concluídos passa confiança muito maior que um anúncio novo sem histórico, e ajuda a combater golpe (perfil golpista não acumula avaliação real).
  - Em aberto: como o site confirma que o serviço foi "de verdade" concluído antes de liberar a avaliação (ex: as duas partes confirmam, ou fica vinculado ao pagamento na plataforma quando esse pilar existir — seção 4.10)? Ver seção 8.
- Outras ideias de segurança (verificação de identidade, denúncia de anúncio suspeito) ainda não foram detalhadas — ficam como ponto a desenvolver mais.

### 4.12 Perfil profissional gerado por IA (site próprio do prestador)

- **Status (2026-09-13): implementado, com três camadas de foto.** Formulário "Criar meu perfil" (e busca por "quero criar meu perfil profissional") já publica a página em `/prestador/<slug>`, com bio escrita pela Claude a partir da descrição da pessoa. Toda foto passa por:
  1. **Ajuste técnico automático (sempre ativo, grátis)** — exposição/contraste/nitidez via `sharp`, sem chave, sem custo.
  2. **Edição por IA generativa (Gemini, condicional)** — `GEMINI_API_KEY` já está configurada, mas a conta gratuita do Google **não cobre modelos de geração de imagem** (confirmado testando de verdade: erro de cota zero no tier grátis pra esses modelos especificamente — achado real, diferente do que a pesquisa inicial sugeria). Só funciona se/quando a Jéssica ativar billing no Google Cloud (tentou, cartão pediu depósito mínimo de R$100 — ela decidiu pular por enquanto). Até lá, cai automaticamente pro ajuste técnico do item 1.
  3. **Troca de fundo (opcional, a pessoa marca uma caixinha — nunca automático)** — pedido específico da Jéssica: não é só remover o fundo, é trocar por um fundo bonito. Implementado 100% grátis e local: modelo de segmentação **U²-Net portátil** (`models/u2netp.onnx`, licença Apache 2.0, baixado de fonte comunitária no Hugging Face — não há ONNX oficial do autor, só PyTorch) recorta a pessoa via `onnxruntime-node`/`@tugrul/rembg` (MIT) e compõe num fundo em degradê escuro→ciano, combinando com a marca. Roda no próprio servidor, sem chave, sem depender de terceiro em tempo de execução, ~3s extra por foto processada.
  - Ainda não conectado com o motor de avaliação (pilar 4.11) nem com destaque pago (pilar 4.8) — ver "em aberto" abaixo.
- **Conectado ao ranking/busca (2026-09-13):** achado real ao testar — um perfil criado só existia no próprio link, nunca aparecia buscando aquele serviço no site (`/api/ranking` só conhecia os 4 prestadores mock; a lista de "serviços cadastrados" que decide se a busca vira ranking também era fixa no front-end). Corrigido: perfis reais entram no ranking (sem avaliação/preço/distância ainda, mostram selo "novo" e um link direto "Ver perfil" em vez de "Chamar agora"), e a lista de serviços reconhecidos (`/api/services`, novo endpoint) agora inclui os cadastrados na hora, não só os mock.
- **Mudança de provedor (2026-09-12):** o cartão da Jéssica foi recusado ao tentar cadastrar billing na OpenAI (comum com cartão brasileiro em serviço internacional — mesmo depois de tentar reativar compra internacional). Ela pediu pra tentar Google (Gemini) ou outro provedor. Trocado pra **Gemini API (Google AI Studio, modelo `gemini-3.1-flash-image` / "Nano Banana")** — ver pesquisa abaixo.
- **Atualização (2026-09-12/13):** o "tier grátis sem cartão" não se confirmou pros modelos de *imagem* especificamente (Google cortou isso — testado com a chave real da Jéssica, erro de cota zero). Ela tentou ativar billing no Google Cloud mesmo assim; o depósito mínimo pedido foi R$100 (dura meses no volume esperado, não é gasto de uma vez), mas ela decidiu **pular essa parte por enquanto** — a chave `GEMINI_API_KEY` fica configurada e pronta, só não funciona até o billing ser ativado. Nesse meio-tempo, resolvido com duas alternativas 100% grátis e sem cartão (ajuste técnico via `sharp` + troca de fundo via U²-Net local, ver "Status" acima) — a pessoa já sai com foto melhor de qualquer jeito.
- **Ideia nova (2026-09-11):** hoje "ser prestador" no site é só aceitar pedidos avulsos — não existe uma página própria, permanente, que a pessoa possa compartilhar. A ideia é criar isso: pela mesma barra de busca (ou um fluxo dedicado a partir dela), o prestador manda algumas fotos e descreve o que faz em poucas frases, e a IA:
  - Melhora/retoca as fotos automaticamente.
  - Escreve uma descrição profissional a partir do que a pessoa mandou.
  - Publica uma página própria do prestador (link compartilhável — ela pode mandar pro cliente, colocar no Instagram, etc.).
- Essa página acumula **avaliações reais** (pilar 4.11 já cobre a lógica de só avaliar depois de serviço concluído de verdade) — com o tempo vira reputação de verdade, não um anúncio solto.
- **Referência de mercado (categoria, não modelo a copiar):** sites de "encontrar profissional de serviço" com filtro por distância, valor e avaliação — isso já existe no site hoje (ranking com `distanceKm`/`price`/`rating`, seção 4.1) e se estende naturalmente pra esses perfis.
- **Se conecta direto com pilares que já existem:**
  - Pilar 4.7 (painel de benefícios) — a lógica de "a IA ajuda a pessoa a ficar com uma presença melhor" é a mesma direção.
  - Pilar 4.8 (assinatura premium/destaque pago) — perfil com página própria é exatamente o tipo de coisa que faz sentido ter uma versão "destacada" paga; **essa é uma fonte de receita real** (anúncio pago no ranking), citada explicitamente pela Jéssica (2026-09-11).
  - Pilar 4.11 (avaliação pós-serviço) — o motor de reputação já desenhado passa a alimentar uma página persistente, não só o histórico de um pedido específico.
- **Ponto técnico em aberto, precisa de decisão da Jéssica antes de virar código:** "melhorar fotos automaticamente" precisa de um serviço de IA de imagem de verdade (o Claude que já usamos processa texto e consegue *analisar* imagem, mas não *edita/melhora* foto) — isso é um custo novo, fora do que já está orçado (Claude + Brave Search, teto de R$50/mês, seção 7). A parte de **texto** (IA escrevendo a descrição do perfil a partir do que a pessoa mandou) já cabe no que está orçado hoje — dá pra começar por aí sem gastar nada a mais.
- **Pesquisa de custo real (2026-09-11), pra decidir com número na mão em vez de chutar:**
  - **Photoroom API** — ~US$0,02/foto só remoção de fundo, ~US$0,10/foto com fundo e sombra gerados por IA. Forte pra foto de produto em e-commerce (recortar e colocar em fundo bonito), menos pra "melhorar" uma foto de pessoa de verdade.
  - **Cloudinary** — tem tier grátis generoso (25 mil transformações/mês), mas os efeitos de "AI enhance" de verdade costumam ficar no plano pago.
  - **Replicate/fal.ai** (modelos avulsos tipo upscale/restauração de foto) — cobram por inferência, faixa de US$0,01 a US$0,10 por imagem.
  - **OpenAI (GPT Image 2, o modelo por trás da edição de imagem do ChatGPT)** — cobrança por qualidade: baixa ~US$0,005/foto, **média ~US$0,04–0,05/foto**, alta ~US$0,17–0,21/foto. Aceita instrução em linguagem natural ("melhora essa foto, deixa com cara profissional") em vez de só recortar fundo — mais adequado pro caso de uso real (foto de pessoa, não produto). Sem plano/assinatura com limite fixo. **Abandonado (2026-09-12): cartão da Jéssica foi recusado no cadastro de billing da OpenAI**, mesmo depois de tentar ativar compra internacional — problema de acesso, não só de preço.
  - **Google Gemini (modelo `gemini-3.1-flash-image`, "Nano Banana") — escolhido.** ~US$0,045–0,15/foto no tier pago (varia por resolução); a variante lite (`gemini-3.1-flash-lite-image`) sai ainda mais barata, ~US$0,03/foto. **Tem tier grátis de verdade: até 500 imagens/dia no Google AI Studio, sem cadastrar cartão.** Chave gerada em minutos em aistudio.google.com, sem billing — só precisa de cartão se passar do tier grátis (não deve acontecer no volume inicial). Aceita instrução em linguagem natural igual o GPT Image 2.
- **Decisão (2026-09-12, Jéssica):** usar **Gemini (`gemini-3.1-flash-image`)** em vez da OpenAI — não só mais barato, mas resolve o problema real de acesso (sem billing/cartão pro volume esperado). Implementado com o mesmo teto mensal de segurança (`PHOTO_ENHANCE_MONTHLY_LIMIT` em `server.js`, mesmo padrão do `BRAVE_SEARCH_MONTHLY_LIMIT`) — mesmo o tier grátis do Google tendo limite diário próprio (500/dia), o teto do nosso lado evita depender só do limite deles.
- **Nota técnica:** a Interactions API do Gemini (endpoint usado) foi lançada em 2026, depois do treinamento do Claude — a implementação em `server.js` foi verificada contra a documentação oficial ao vivo (2026-09-12), mas o formato exato do campo de resposta com a imagem pode variar entre versões da API; `enhancePhoto()` tenta algumas variações prováveis e sempre degrada com segurança (devolve a foto original) se não conseguir extrair o resultado. Confirmar o formato de resposta real assim que a chave estiver configurada e um teste real rodar.

### 4.13 Login com Google (contas de verdade)

- **Ideia nova (2026-09-13, Jéssica):** hoje o site não tem login nenhum — qualquer pessoa cria um perfil profissional sem provar quem é, e não tem como voltar depois pra editar o próprio perfil, ver um painel dos pedidos que aceitou, ou reivindicar de volta um perfil já criado. Login com Google resolve isso sem exigir senha pra gerenciar (a pessoa já tem conta Google).
- **O que isso desbloqueia:**
  - Editar o próprio perfil depois de criado (hoje é criar-uma-vez-só, sem volta).
  - Um painel pessoal: pedidos publicados, pedidos aceitos, o próprio perfil.
  - Atribuir avaliação a uma identidade verificada, não a um nome digitado à mão (reforça o pilar 4.11 contra golpe).
  - Base necessária pro pilar 4.8 (assinatura premium) — precisa saber *quem* está pagando por *o quê*.
- **Decisão (2026-09-13, Jéssica): opcional.** Perfil continua podendo ser criado sem login (não trava quem só quer testar rápido); logar é um upgrade — hoje já marca quem é dono de qual perfil, editar/painel ficam pra depois.
- **Decisão (2026-09-14, Jéssica): só Google por enquanto, sem outros provedores.** Perguntei se valia adicionar Facebook/Apple além do Google — decisão foi deixar só Google. Motivo: cobre a grande maioria de quem usa Android no Brasil, login já é opcional (não é bloqueio de conversão), Facebook exigiria aprovação do Meta (processo parecido com o do WhatsApp Business, já pendente) e Apple Sign In exige conta paga de desenvolvedor (~R$500/ano) — custo/esforço sem urgência real. Pode ser revisitado depois se fizer falta.
- **Status (2026-09-13): implementado (login básico).** Botão "Entrar com Google" (Google Identity Services) no menu, só aparece com `GOOGLE_CLIENT_ID` configurada. `google-auth-library` verifica o token no servidor (`/api/auth/google`), sessão em cookie httpOnly com token de sessão aleatório, expirando em 30 dias no navegador **e** no servidor (`/api/auth/me`, `/api/auth/logout`). Perfil criado enquanto logado já grava `ownerUserId`.
- **Status (2026-09-14): Client ID configurado e ativo em produção.** A Jéssica criou o Client ID ("top 3 login") no Google Cloud Console, com `https://top3profissional.com.br` cadastrado em "Origens JavaScript autorizadas" — configuração conferida direto no console antes de ativar. Chave adicionada no `.env` local e no VPS, serviço reiniciado. `https://top3profissional.com.br/health` confirma `googleLoginConfigured: true`. Botão de login está no ar de verdade agora, não só implementado.
- **Status (2026-09-14): "editar perfil" e o começo do painel pessoal, implementados.** Clicar no nome/foto de quem está logado abre um dropdown ("Meus perfis") listando os perfis que a pessoa é dona, com atalhos "Ver" (link público) e "Editar". Editar reaproveita o mesmo formulário de "Criar meu perfil" (nenhum formulário novo, por causa dos princípios de UI/UX da seção 10) — só muda o texto do botão e o destino do envio (`PUT /api/providers/:slug` em vez de `POST /api/providers`); descrição e fotos ficam opcionais na edição (deixar em branco mantém a bio/fotos atuais), e nome/serviço/local/WhatsApp são reenviados. Slug, id e dono nunca mudam — o link compartilhado continua o mesmo depois de editar. Servidor confere login **e** posse (`ownerUserId === currentUser.id`) antes de aceitar qualquer edição — 401 sem login, 403 se o perfil for de outra pessoa, 404 se o slug não existir.
- **Em aberto pra próxima etapa:** o painel pessoal ainda só lista perfis — falta a parte de "pedidos publicados/aceitos" (depende de REQUESTS também ganhar noção de dono, hoje é só WhatsApp/nome digitado).

### 4.14 Grupos de Economia — motor geral de "gente quer a mesma coisa"

- **Origem (2026-09-14, Jéssica):** depois de eu recusar construir divisão de assinatura tipo Netflix (viola termos de uso, mesmo pelo "assinante extra" oficial — ver `docs/futuro-assinaturas-e-pagamentos.md`), a Jéssica propôs uma ideia melhor e mais ampla: um motor **universal** de grupos — não só assinatura, mas qualquer coisa onde "quanto mais gente, menor o custo por pessoa": compra coletiva, frete compartilhado, viagem, serviço local em grupo, curso/evento.
- **Ideia central:** pessoa demonstra interesse → o site encontra outras pessoas com interesse compatível → forma um grupo → mostra quantidade/objetivo/cidade/prazo → quando completa, o site conecta as pessoas → **combinação e pagamento acontecem fora do site**, igual todo o resto do site já funciona (contato por WhatsApp).
- **Escopo da v1, travado explicitamente pela Jéssica (2026-09-14) antes de qualquer código, pra não misturar com pagamento:**
  - **Entra:** criar oportunidade de grupo, participar, sair antes de fechar, contagem de vagas, prazo, cidade/região, categoria, preço estimado, status (`aberto` / `completo` / `encerrado`), impedir participação duplicada, registro básico de eventos (sem tela própria ainda — só acumulando dado pra reputação futura).
  - **Não entra (de propósito, fica documentado em `docs/futuro-assinaturas-e-pagamentos.md`, não em código):** Netflix/assinatura compartilhada, carteira, escrow, split automático, cobrança, pagamento recorrente, chat interno, nota de 1 a 5, fila de substituição automática, notificação.
  - **Reputação:** não entra na v1. Sequência combinada: v1 → primeiros usuários reais → medir quantos grupos completam / tempo / desistência / economia real → só então reputação baseada em comportamento (fatos tipo "participou de 8 grupos", nunca nota subjetiva enquanto não tem volume — evita manipulação/ruído).
- **Status (2026-09-14): implementado.** 6 categorias (`compra`, `frete`, `viagem`, `servico`, `curso`, `assinatura` — qualquer outra é rejeitada com erro). `POST /api/groups` cria (quem cria já entra como primeiro membro), `GET /api/groups` lista (filtro por categoria, grupos `encerrado` somem da lista mas continuam consultáveis direto), `GET /api/groups/:id` mostra detalhe — contato de **todo mundo** só aparece aqui quando o grupo está `completo`; enquanto `aberto`, só o contato de quem criou aparece (pra quem tem dúvida poder perguntar antes de entrar). `POST /api/groups/:id/join` entra (rejeita WhatsApp duplicado, rejeita se já não está `aberto`), vira `completo` sozinho ao atingir a meta. `POST /api/groups/:id/leave` sai (só funciona enquanto `aberto`); grupo que fica sem ninguém vira `encerrado`. Rate limit por IP (mesmo padrão já usado em `/api/providers`) contra spam. Seção "Grupos de economia" no site, entre Corridas e Publicar, com filtro por categoria e formulário mínimo de criar (poucos campos, mesmo princípio do resto do site).
- **Por que não tem busca inteligente/fila/notificação ainda:** decisão explícita da Jéssica de testar o ciclo básico ponta a ponta primeiro (criar → alguém acha → participa → completa) antes de avançar pra essas partes — evita construir automação em cima de um mecanismo ainda não validado com gente de verdade.
- **Status (2026-09-14, task-001): categoria `assinatura` adicionada.** Depois de reconsiderar o desenho (sem TOP3 verificar credencial, sem reter pagamento — as pessoas se encontram pelo site e combinam/pagam direto entre si, igual as outras categorias), streaming/assinatura virou só mais uma categoria genérica, sem engine especial nenhuma. Grupos dessa categoria mostram um aviso fixo no card: "O TOP3 só ajuda vocês a se encontrarem. Combinem entre vocês e sigam sempre as regras oficiais do serviço (ex: assinante extra da Netflix)." Isso reduz bastante o risco jurídico original (o site vira parecido com um quadro de classificados genérico, não um serviço organizando compartilhamento) — o risco não desaparece 100%, mas fica muito mais defensável. Reputação/denúncia continuam de fora — ver `docs/futuro-assinaturas-e-pagamentos.md` pro desenho completo (mais detalhado agora) e por que dependem de login, que "Grupos" ainda não exige.
- **Status (2026-09-14, task-002): categoria `carona` adicionada — carona compartilhada AGENDADA, não corrida sob demanda.** Motorista posta rota com vagas, passageiro posta rota desejada, o site conecta. Sem verificação contra base oficial (DETRAN), sem rastreamento contínuo, sem pagamento — só coleta e exibe o que o motorista declarou (CNH, placa, modelo, cor do veículo), pro passageiro decidir com informação antes de embarcar; esses dados nunca aparecem na listagem, só no detalhe do post específico ("Ver detalhes"), mesma regra de informação sensível do resto do mecanismo. Aviso fixo nos posts dessa categoria: "O TOP3 apenas conecta pessoas para carona compartilhada. Confirme identidade, placa e combine tudo antes de embarcar — o site não verifica motoristas, não intermedeia pagamento e não se responsabiliza pela viagem."
  - **Modelagem técnica:** motorista reaproveita o mecanismo de vagas já existente — `targetMembers` = vagas de passageiro + o próprio motorista (que ocupa a "vaga 0" na criação), então "vagas restantes" cai de graça do cálculo já existente (`targetMembers - currentMembers`), sem precisar de conceito novo. Passageiro é sempre `targetMembers = 1` — o próprio post já é a única vaga, por isso ninguém consegue "entrar" nele (o mecanismo genérico já rejeita entrar em grupo `completo`); no front-end, posts de passageiro não mostram o botão "Participar" (mostrariam "Completo ✓" de forma enganosa — o post não foi encerrado, só não é o tipo de coisa que se "entra").
  - **Localização é sempre opcional e pedida na hora** (`navigator.geolocation`), nunca salva além do necessário pra ordenar a busca por proximidade (Haversine, já usado no ranking) — sem reverse geocoding (custaria uma API paga), a pessoa continua digitando a origem manualmente, só a ordenação dos resultados usa lat/lng quando fornecido.
  - **Contexto jurídico (Minas Gerais, documentado no task-002):** tribunais de SP, PR, RS e GO já validaram carona solidária (rateio de despesas, sem lucro) como diferente de transporte remunerado, sem exigir cadastro formal. O DER-MG fiscaliza ativamente com critério subjetivo (frequência, geração de renda), e existe um PL estadual (5838/2026, ainda em tramitação, não é lei em vigor) que exigiria registro da plataforma e validação formal de CNH/CPF/veículo — os campos obrigatórios do motorista antecipam essa direção sem a infraestrutura pesada de verificação. Se o PL virar lei, revisar a necessidade de registro formal da operadora junto ao órgão estadual (passo administrativo, não só código).
  - **O que fica de fora, documentado:** app de corrida sob demanda (motorista aceita em tempo real, GPS ao vivo, despacho, pagamento indo pro motorista) — categoria jurídica diferente (Lei federal 13.640/2018 + regras municipais, a própria plataforma pode precisar de registro), engenharia de outra ordem de grandeza, e reabre o problema de intermediação de pagamento regulado pelo Banco Central. Ver `docs/futuro-assinaturas-e-pagamentos.md`.

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

- **Orçamento máximo redefinido pela Jéssica (2026-09-14): R$400/mês no total**, pra manter o site inteiro no ar (hospedagem + todas as APIs) — substitui o teto antigo de R$50/mês que era só pra busca/IA. Diretriz explícita: economizar em tudo o que for possível, priorizar caminhos grátis sempre que exista um bom o suficiente.
- **Gasto registrado até agora (2026-09-14, informado pela Jéssica):**
  - R$129 no Google Cloud (créditos pré-pagos pro Gemini, pilar 4.12) — **já esgotado**, confirmado via teste direto da chave (erro "prepayment credits are depleted").
  - R$30 na API da Anthropic (Claude) — **já esgotado também**, confirmado (erro "credit balance is too low"); isso deixa a busca por IA do site fora do ar até recarregar.
  - R$59/mês no VPS Hostinger — status de uso em aberto (ver pergunta abaixo).
- **Brave Search API**: US$5 por 1.000 buscas. **Status (2026-09-14): não é mais o caminho principal** — trocado por SearXNG autohospedado e grátis (ver seção 4.3), Brave vira só um fallback pago que só é chamado se o SearXNG falhar ou não estiver configurado.
- **Claude API**: cobrança por uso (ver seção 4.3 sobre também reduzir a frequência de chamada, priorizando os caminhos estruturados grátis — ranking e corridas — antes de cair no agente de IA).
- ~~Grok vs Claude~~ — resolvido, não compensa (ver seção 8).
- **Em aberto (2026-09-14): o que fazer com o VPS Hostinger (R$59/mês)?** A Jéssica mencionou "não uso" sobre o Hostinger, mas não ficou claro se é sobre o VPS que hospeda o site (cancelar derrubaria o site do ar) ou sobre outra coisa (ex: rodar a sessão do Claude Code na nuvem, tema de uma conversa anterior sem relação com hospedagem do site). **Não cancelar nada até confirmar.** Detalhe técnico relevante pra essa decisão: o VPS é taxa fixa (não cobra por CPU/RAM usado), então rodar o SearXNG nele (quando for a hora de sair do "só local" — ver seção 4.3) não aumentaria a fatura.
- **Ainda não pesquisado**: custo de eventuais comissões/parcerias de afiliados (tendem a ser receita, não custo, mas precisa confirmar termos de cada programa quando chegarmos lá); custo de gateway de pagamento (seção 4.10) quando chegarmos nele; eventual custo do WhatsApp Business API quando a Jéssica configurar isso (adiado por ela, 2026-09-14).

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

## 10. Princípios de UI/UX (Jéssica, 2026-09-11 — reler antes de mexer na interface)

A Jéssica apontou, mais de uma vez na mesma sessão, o mesmo tipo de erro: eu construindo uma peça de interface nova sem checar se ela já existia (de outro jeito) em outro lugar do site. Isso não pode se repetir — os princípios abaixo existem pra evitar isso de novo.

- **Um controle por ação, nunca dois fazendo a mesma coisa.** Antes de adicionar um botão/aba/seção nova, procurar no site inteiro se já existe algo cobrindo a mesma ação. Se existir, decidir e unificar — não perguntar pra Jéssica resolver duplicação óbvia.
- **A busca roteia por intenção, não devolve sempre a mesma coisa.** O app não é um chat genérico com histórico de mensagens — é um app de serviços com uma barra de busca sempre visível embaixo (estilo app de transporte/entrega por celular). Quando a pessoa descreve o que precisa:
  - Se for sobre um **serviço/profissional cadastrado**, mostrar o **ranking** ("Os 3 mais bem avaliados"), não um parágrafo de texto.
  - Se for sobre **corrida/carona/agendamento**, mostrar o **painel de corridas** (corrida/carona compartilhada — assume hoje por padrão pra facilitar, só pede de/pra), com o que já foi publicado nesse trajeto.
  - Só cair no texto livre de IA (com busca na web) pro que sobrar — terreno, carro, produto, ou qualquer coisa fora dessas duas categorias estruturadas.
  - Resultado esperado: menos chamada de IA/Brave Search pros casos estruturados (mais rápido e mais barato), e uma resposta que já é a própria ação (ver ranking, ver corridas publicadas), não um texto que ainda precisa virar ação.
- **"Mostrar resultado" e "pedir mais dados" são coisas diferentes, mas nunca duas telas separadas pra mesma decisão.** Ex: publicar um pedido pode acontecer por conversa OU por formulário (decisão explícita da Jéssica, 2026-09-11: manter os dois, mas o formulário tem que ficar o mais enxuto possível) — mas nunca dois formulários, ou um formulário e uma tela paralela fazendo a mesma coisa de outro jeito.
- **Antes de entregar uma mudança de UI, andar pelo site inteiro mentalmente** (topo → ranking → corridas → publicar → barra fixa embaixo) e perguntar: alguma dessas telas ficou redundante ou incoerente com a que acabei de mudar? Se sim, resolver antes de reportar como pronto — não deixar pra Jéssica notar depois.

Ver também [[feedback_product_coherence_top3]] (memória entre sessões com o mesmo princípio, incluindo a citação original da Jéssica).

---

*Este arquivo deve crescer com o tempo. Qualquer ideia nova, ajuste de direção, ou decisão tomada numa conversa deve ser adicionada aqui antes de virar código.*
