# ORIGINAL_BRIEF — pedido original do usuário (2026-09-30)

> Texto do usuário preservado como referência de intenção. Listas foram compactadas em linha (itens separados por `;`),
> sem mudar conteúdo. Em caso de dúvida sobre o que o usuário quis, **este arquivo vence** a interpretação de qualquer doc.

## A. Mensagem do usuário no chat (contexto adicional)

Projeto Márcio Lobo. Avaliar a criação de um jogo no navegador muito bem feito para ser muito bonito, bem animado,
frenético e otimizado para rodar no navegador e navegador de mobile (tela deita sozinha para jogar). Hospedagem:
https://github.com/isaacbraym/ProjetoLobo — o repositório é público, mas como vai ficar num github.io, terá **senha para
liberar o jogo**, pois será passado para amigos jogarem sem acesso de qualquer um. **Senha: definida pelo usuário — guardada só em `.env.local` (fora do Git).**
Usar o que for útil da análise do ProjetoBairro na organização da pasta. Criar na pasta `C:\PROJETOS\Lobo`.
O primeiro processo de construção roda no "ultracode" do Opus 5.5; depois em "high" para ajustar o que faltar.
**Quando ele se transforma em lobisomem, o áudio da transformação é `FALA LOBINHO - sem ruido.mp3`** (vai dar um close
nele de frente se transformando); **o áudio vai abafar bem a música de fundo.**

### Respostas do usuário às perguntas (2026-09-30)
- **Assets:** inicialmente **100% automático** — "peço para se esforçar pois você tem um potencial incrível". O usuário
  **pode baixar as animações do Mixamo**: basta mandar os links que ele deixa na pasta organizado.
- **Rosto:** usar **a técnica do WWE 2K23+** (foto do rosto → ajuste da cabeça + projeção) para ficar bem fiel —
  **sem** modelo 3D gerado por serviços de terceiros.
- **Privacidade:** **repositório público + senha simples** (ciente de que é barreira casual).
- **Imagem do Márcio super-herói** (verde/amarelo): **skin desbloqueável**.
- **Clóvis:** segunda imagem (`refs/clovis/clovis_body.jfif`): "ele tem essa expressão mesmo", **bengala como arma
  principal** e **a perna que vira cobra como arma secundária**.

## B. Prompt original (literal, compactado)

PAPEL — Atue como arquiteto principal de software, game designer técnico e technical director deste projeto. NÃO comece
imediatamente a desenvolver o jogo. Sua primeira responsabilidade é analisar profundamente o contexto existente,
principalmente o projeto de jogo que já está sendo desenvolvido em Unreal nesta máquina, identificar tudo que pode ser
reaproveitado conceitualmente e elaborar a melhor arquitetura possível para uma NOVA implementação destinada
exclusivamente ao navegador. Ao final: 1. proposta técnica completa; 2. arquitetura recomendada; 3. stack tecnológica;
4. estrutura de diretórios e módulos; 5. estratégia de desenvolvimento; 6. estratégia de assets, animação, física, IA e
otimização; 7. riscos e soluções; 8. critérios objetivos de qualidade; 9. e principalmente um PROMPT MESTRE FINAL,
pronto para ser enviado em outro chat do Claude Code Opus 5.5, que será responsável por construir o jogo inteiro.

CONTEXTO — Já existe nesta máquina outro projeto de jogo em Unreal Engine. Esse novo projeto NÃO utilizará Unreal.
Analise o projeto existente e identifique conceitos úteis de: arquitetura; organização; modularização; sistemas;
harness; ferramentas; automações; pipeline de desenvolvimento; estrutura agent-first; documentação; convenções;
gerenciamento de estado; sistemas de gameplay; testes; validações; sistemas de assets; comportamento dos agentes;
qualquer infraestrutura avançada existente. Extraia os conceitos bons. NÃO porte literalmente coisas da Unreal.
Distinga: conceitos de engenharia reutilizáveis; conceitos de gameplay reutilizáveis; infraestrutura reutilizável;
coisas específicas da Unreal que devem ser descartadas; coisas que precisam ser redesenhadas para Web. Aproveitar a
maturidade daquele projeto sem carregar seu peso tecnológico.

OBJETIVO — Jogo 3D de ação extremamente impressionante no navegador. Sensação: "Não é possível que uma IA tenha feito
isso." Não uma demonstração técnica: um pequeno jogo comercial extremamente bem produzido dentro das limitações da Web.
Precisa ser: bonito; frenético; divertido; violento; extremamente responsivo; visualmente coerente; muito bem animado;
satisfatório de jogar; surpreendentemente avançado para navegador.

REFERÊNCIA DE EXPERIÊNCIA — A ambientação e exploração devem lembrar a experiência 3D do projeto do Nate Herk / AIS Live.
Interessa: sensação de entrar em um grande ambiente corporativo 3D; explorá-lo naturalmente; corredores; grandes
espaços; salas; áreas abertas; mudança de ambientes; sensação de prédio real; escala; iluminação; atmosfera; exploração
livre; apresentação visual convincente. TVs, painéis e monitores podem exibir vídeos aleatórios em loop só como
ambientação. Vídeos NÃO são parte central.

PREMISSA — O protagonista se chama Márcio. Ele entra em um grande prédio corporativo e percebe que uma organização
criminosa tomou o edifício. Funcionários e visitantes são reféns. Márcio decide resolver sozinho. Estética consciente de
filme de ação exagerado. Márcio é anti-herói: não é policial perfeito nem super-herói; é brutal e começa a destruir os
criminosos.

PRÉDIO — 3 andares principais; cada andar é uma grande fase com: exploração; corredores; salas secundárias; grandes
arenas; encontros menores; encontros principais; reféns; áreas opcionais; elementos ambientais; armas improvisadas;
destruição; progressão; um Boss. Bosses não logo após o início: o jogador conquista o caminho. Pode explorar
amplamente o andar atual, mas o próximo só é liberado após o Boss morrer (Boss 1 → andar 2; Boss 2 → andar 3; Boss 3 →
final).

BOSSES — Três bosses humanos extremamente perigosos, memoráveis, maiores que inimigos comuns em personalidade,
comportamento e presença. Cada um: apresentação cinematográfica; identidade visual; animações próprias; golpes
exclusivos; comportamento específico; fases se fizer sentido; arena adequada; música própria ou variação; personalidade
perceptível. BOSS 1: **Clóvis B.** — referência `C:\Users\Dell\Downloads\Clovis.png`; grande fidelidade ao rosto.
Bosses 2 e 3 definidos depois; arquitetura deve permitir adicionar/substituir bosses sem reestruturar o jogo.

PERSONAGEM PRINCIPAL — Referência do Márcio: `Imagem do ChatGPT 30 de set. de 2026, 21_14_50-1.png`. Identidade visual
extremamente fiel. **O rosto é prioridade.** Não "inspirado no Márcio": "esse personagem claramente É o Márcio". Avaliar
pipeline Web/Blender: face texture projection; image-based facial fitting; face reconstruction; morph targets; head mesh
fitting; projeção sobre cabeça base; geração assistida; combinação. Não presumir que pedir a uma IA um personagem 3D
basta. Estratégia realista.

ESTILO — Semi-realista estilizado. Evitar hiper-realismo pesado e low-poly simplificado demais. Anatomia convincente;
materiais bons; iluminação boa; personagens expressivos; cenário detalhado; performance Web. Personagens têm prioridade
visual sobre detalhes de cenário.

CÂMERA — Terceira pessoa dinâmica: levemente afastada; confortável para exploração e contra grupos; ajustes automáticos
em combate; evita paredes; enquadra ameaças; boa leitura da ação; aproxima discretamente em finalizações; cinematográfica
sem atrapalhar. Deve parecer parte profissional do jogo.

COMBATE — Arcade brutal, combos simples de aprender e gostosos de assistir. Não fighting game competitivo. Fácil;
rápido; visceral; fluido; agressivo; responsivo. Fazer coisas incríveis sem decorar dezenas de comandos. Combos: ataque
leve; pesado; chute; esquiva; corrida; agarrão; arremesso; contextuais; armas; finalizações. Combinações simples geram
sequências variadas; evitar o mesmo botão = mesma animação.

FINALIZAÇÕES — Cinematográficas brutais. Referência conceitual: sensação de poder e brutalidade de Prototype (sem
copiar): violência exagerada; impacto; velocidade; câmera cinematográfica; poder; animações contextuais; variedade.
Rápidas para não destruir o ritmo.

SANGUE E MORTE — Violência gráfica: sangue; marcas de impacto; mortos; ragdoll; desmembramento principalmente como
Lobisomem. Corpos NÃO desaparecem imediatamente; solução de performance: corpos próximos completos; distantes podem
congelar física, simplificar rig, virar representação estática — sem sumir diante do jogador.

RAGDOLL — Física convincente. Integração ANIMAÇÃO → IMPACTO → RAGDOLL. Evitar boneco de pano absurdo, articulações moles,
cadáver saltando sem peso. Sensação de massa.

INIMIGOS — Não parecer clones. Sistema procedural/modular de variação: rosto; cabelo; barba; bigode; altura; porte;
camisa; casaco; calça; sapato; acessórios; cores; tatuagens. Variedade sem dezenas de personagens independentes.
Classes: Thug (básico); Fast (rápido, agressivo); Heavy (grande, resistente, lento); Grappler (agarra Márcio); Armed (arma
improvisada); Elite (inteligente, esquiva, combos). Liberdade para melhorar. Cada inimigo: barra de vida sobre a cabeça;
nível/tier; indicador simples. HUD limpo, não MMORPG.

IA — Organizada. Evitar dez inimigos no mesmo ponto. Alguns atacam; outros cercam; outros aguardam; outros reposicionam;
armados usam distância; fortes pressionam mais. Avaliar combat slots / attack tokens / engagement slots.

ARENAS E BARRICADAS — Em grandes encontros Márcio entra numa área e os criminosos bloqueiam saídas (portas; grades;
barricadas; móveis; segurança; fechamentos improvisados). Preso até eliminar todos. Depois: barricada cai; porta libera;
mecanismo destrava; próximo espaço abre — de formas variadas.

REFÉNS — Funcionários; visitantes; seguranças; pessoas escondidas. Antes de Márcio: medo; submissão; esconder; mãos na
cabeça; ajoelhados; agrupados; vigiados. Quando Márcio combate: esperança e alívio. Márcio pode atingir e matar reféns
sem penalidade de gameplay; eles não lutam. Reação contextual: se salvando → felizes, observam, esperança, agradecem,
fogem para áreas seguras. Se Márcio ataca civis → pânico, correm, cantos, abaixam, protegem a cabeça, imploram, evitam
Márcio, gritam. Sem sistema moral complexo; só reação convincente.

ARMAS IMPROVISADAS — Inspiração Cadillacs and Dinosaurs / beat'em ups. Porrete; chave inglesa; bastão de baseball;
guitarra; faca; facão. Cada arma: dano; animação; alcance; peso; som; impacto; durabilidade. Quebram, deformam, viram
inúteis ou são descartadas. Identidade sonora: guitarra (impacto, cordas vibrando, madeira quebrando); chave inglesa
(metálico); bastão (seco); facão (cortante).

CENÁRIO DESTRUTÍVEL — Cadeiras; mesas; computadores; monitores; divisórias; bebedouros; vasos; móveis; decorativos;
algumas portas; vidro; equipamentos. NÃO tudo de papel: resistência por material (material; resistência; massa;
integridade; danificado; destruído). plástico < madeira < metal estrutural. Convincente, não científico.

LOBISOMEM — Márcio transforma-se temporariamente em LOBISOMEM MÁRCIO (referência
`Imagem do ChatGPT 30 de set. de 2026, 21_14_52-3.png`). Preservar características do Márcio: "Márcio transformado", não
lobisomem genérico. Barra de poder que cresce com gameplay (avaliar dano causado; combos; eliminações; dano recebido;
ações especiais) incentivando agressividade, não ficar parado. Ativação manual com barra cheia. Transformação: um dos
momentos mais impressionantes; animação dedicada; mudança corporal; músculos crescendo; transformação facial; garras;
pelos; postura; som agressivo; câmera cinematográfica; iluminação/VFX; impacto; sem bloquear demais. Como Lobisomem:
muito mais dano; mais vida/resistência; velocidade; ataques próprios; área; destruição muito maior; lança inimigos;
desmembramento; devorar inimigos (recupera vida; animação; som; feedback; benefício claro; curto). Timer que diminui;
ao acabar volta a humano; tempo para "entrar numa sala e causar um caos absurdo" sem trivializar a fase; valores
configuráveis. Corrida máxima **de quatro**: animação animal convincente; peso; aceleração; câmera acompanhando; FOV
aumentando discretamente; motion blur leve; shake muito controlado; efeitos de velocidade — "essa porra ficou muito
rápida". Destruição: humano 3–5 pancadas para uma mesa; Lobisomem atravessa/destrói fácil.

VIDAS — 3 vidas; perdeu todas: Game Over. DIFICULDADE — Fácil; Normal; Difícil; não só HP: agressividade; frequência de
ataque; quantidade; composição das ondas; comportamento; dano; janelas de reação.

TRILHA — Metal / rock. Dinâmica: exploração (atmosférico); combate (intensifica); arena (entra forte); boss (faixa ou
camada especial); lobisomem (camada ainda mais agressiva).

ANIMAÇÃO — UMA DAS MAIORES PRIORIDADES. 10 excelentes > 50 ruins. Márcio: idle; caminhada; corrida; combate; combos;
esquiva; agarrão; arremesso; armas; dano; finalizações. Lobisomem: idle; caminhada; corrida bípede; quadrúpede;
ataques; garras; saltos; agarrões; finalizações; devorar; transformação; retorno. Inimigos: ataques; reação; esquiva;
stagger; knockback; queda; ragdoll; morte; arma. Civis: medo; esconder; correr; implorar; abaixar; alívio. Considerar:
state machines; blending; additive; ajuste procedural; IK; foot placement; hit reactions; contextual; animation events.
Sem transições robóticas.

AMBIENTE — Arquitetonicamente convincente: hall principal; recepção; escritórios; reunião; cafeteria; espaços técnicos;
VIP; segurança; corredores; banheiros; descanso; depósitos; escadas/elevadores; ambientes exclusivos por andar.
Exploração não totalmente linear: rotas alternativas; áreas opcionais; salas; recompensas; itens; detalhes; pequenos
segredos. Não labirinto. TVs/monitores: vídeos locais, placeholder, procedurais, livres ou substituíveis; sem depender de
pasta específica.

MOBILE — Funcionar no celular; priorizar LANDSCAPE; orientar, sugerir rotação, adaptar UI, reorganizar HUD dentro das
limitações reais dos navegadores; fallback elegante. Controles: analógico virtual; câmera; ataque; pesado; esquiva;
interação; transformação; arma. HUD limpo, transparente, sem cobrir metade da tela. DESKTOP: teclado; mouse;
eventualmente gamepad (desejável).

PERFORMANCE — Um dos requisitos MAIS IMPORTANTES. Surpreender visualmente sem rodar a 12 FPS. Desde o início: LOD;
frustum culling; occlusion; instancing; pooling; atlases; texturas comprimidas; malhas otimizadas; otimização de
animação; physics sleeping; ragdoll seletivo; colisão simplificada; carregamento progressivo/assíncrono; streaming por
andar/zona; luz baked quando adequado; dinâmica só onde agrega; presets escaláveis. Perfis: Low (celulares fracos);
Medium (intermediários/notebooks modestos); High (desktop); Ultra (fortes) — escalabilidade, não quatro jogos. Alvo
desktop: notebook RTX 3050 4 GB, sem usar toda a VRAM; ser conservador. Corpos: Tier 1 ragdoll completo próximo; Tier 2
sleep/pose congelada; Tier 3 representação baratíssima distante; jogador percebe que continuam ali. EFEITOS:
partículas; poeira; debris; sangue; sparks; vidro; impacto; trails; transformação; luz contextual; câmera — sem entupir
a GPU.

ARQUITETURA — Sistemas desacoplados: Player; Combat; Abilities; Werewolf; Weapons; Enemies; AI; Bosses; Civilians;
Interaction; Destruction; Physics; Animation; Camera; Audio; Levels; Streaming; UI; Save/Progress; Difficulty; Effects.
DATA-DRIVEN (ex.: EnemyDefinition: modelVariant, HP, damage, speed, aggression, attackSet, weaponSet, tier,
behaviorProfile; idem armas, bosses, objetos, níveis, dificuldade).

TECNOLOGIA — Nada imposto (Three.js, Babylon.js, PlayCanvas, R3F, Godot Web, Unity WebGL…). Escolher o que permite ao
Claude Code Opus 5.5 produzir o MELHOR RESULTADO sozinho. Critérios: qualidade visual; domínio real do Claude; automação
por código; debugging; física; animação; performance Web; deploy; mobile; geração/integração de assets; agent-first.
Não escolher por sofisticação; escolher o que aumenta a chance de terminar bem. LEVE EM CONTA SUAS LIMITAÇÕES: você
também vai implementar. "Qual arquitetura permite que EU, Opus 5.5, produza o melhor jogo possível com menor dependência
de trabalho manual do usuário?" BLENDER — pode usar: procedural; Python; automação; rigging; retopology; texture
projection; otimização; GLTF/GLB; animações; LOD. Trabalho repetitivo automatizado; sem horas de cliques do usuário.

AGENT-FIRST — instruções claras; docs; comandos; scripts; testes; verificações; logs; screenshots; inspeção; recuperação
após erro; checkpoints; builds reproduzíveis. VALIDAÇÃO VISUAL — não aceitar só "build passou": rodar; abrir no browser;
screenshots; testar gameplay; analisar erros; observar performance; revisar UI; verificar animações; usar browser
automation/computer control se disponível. AUTO-TESTE — ciclo IMPLEMENTAR → RODAR → TESTAR → OBSERVAR → CORRIGIR →
MELHORAR → REPETIR.

NÃO FAÇA UM TECH DEMO — nada de capsule andando, cubos como inimigos, sala cinza, três animações, "proof of concept".
Prototipagem interna aceitável; OBJETIVO FINAL: JOGO.

PRIORIDADES (em conflito): 1. sensação do combate; 2. Márcio; 3. animações; 4. inimigos; 5. Lobisomem; 6. câmera;
7. ambiente; 8. física; 9. Bosses; 10. som; 11. destruição; 12. efeitos secundários. Um cenário perfeito com personagem
ruim falha; personagem ótimo lutando bem num ambiente mais simples ainda impressiona. FILOSOFIA: PERSONAGENS + MOVIMENTO +
IMPACTO. O prédio é palco; as pessoas são a alma.

ETAPAS DESTE CHAT — 1 analisar o projeto Unreal (reutilizar/adaptar/descartar); 2 analisar o novo jogo (sistemas,
dependências, gargalos, riscos, dificuldade real, requisitos críticos); 3 escolher a stack (comparar, escolher UMA,
explicar por quê, vantagens, desvantagens, riscos, descartadas); 4 arquitetura (sistemas, módulos, fluxo de dados,
arquivos, asset/animation/AI/physics-destruction/character pipelines, face likeness, deploy, mobile, otimização);
5 fases com milestones jogáveis (Vertical Slice: Márcio + sala + 3 inimigos + combate excelente; Combat Slice; Werewolf
Slice; Environment Slice…), cada uma testável; 6 métricas realistas (FPS, load, draw calls, triângulos, texturas,
memória, NPCs, corpos, physics bodies, mobile); 7 riscos com Plan A / fallback (fidelidade facial, animação, ragdoll,
corpos, desmembramento, mobile, NPCs, destruição, performance, bosses, transformação); 8 PROMPT MESTRE
(`MASTER_BUILD_PROMPT.md`) com tudo que o próximo agente precisa: decisões, aproveitamento do Unreal, arquitetura,
prioridades, impedir regressões, milestones, ordem, liberdade criativa onde apropriado, impedir overengineering, teste
contínuo, validação visual, otimização, continuar iterando; trabalhar autonomamente por longo período sem perguntar
constantemente. Entregáveis: ANALYSIS.md, ARCHITECTURE.md, TECH_STACK_DECISION.md, ASSET_PIPELINE.md,
PERFORMANCE_PLAN.md, DEVELOPMENT_ROADMAP.md, RISK_REGISTER.md, MASTER_BUILD_PROMPT.md (o principal).
REGRA FINAL — pense como quem vai construir depois; maximize a probabilidade de o Claude Code Opus 5.5 realmente
conseguir construir sozinho um jogo 3D impressionante, bonito, frenético e estável no navegador.
