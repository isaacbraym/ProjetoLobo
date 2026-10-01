# MIXAMO_DOWNLOAD_LIST — animações para o usuário baixar (opcional, melhora muito o combate)

O jogo **funciona sem isto** (fontes CC0 + animação por script). Com isto, o combate ganha muito mais variedade e
qualidade. O agente integra automaticamente o que aparecer na pasta.

## Como baixar
1. Entre em https://www.mixamo.com com sua conta Adobe (grátis).
2. Personagem: deixe o padrão **Y Bot**. Primeiro baixe **o próprio Y Bot em T-pose** (aba Characters → Y Bot → Download
   → *FBX Binary, T-pose, With Skin*) e salve como `assets-src/vendor/mixamo/_ybot_tpose.fbx`.
3. Para cada linha abaixo: clique no link (já abre a busca), escolha o resultado mais parecido com a descrição, clique
   em **Download** com estas opções:
   - **Format:** FBX Binary (.fbx) · **Skin:** *Without Skin* · **Frames per Second:** 30 · **Keyframe Reduction:** none
   - Se aparecer a caixa **In Place**, marque **só** nas linhas com "In Place = sim".
4. Salve em `C:\PROJETOS\Lobo\assets-src\vendor\mixamo\<pasta da tabela>\` com o nome que o Mixamo der.
   Pode baixar 2–3 variações de um mesmo termo se gostar — quanto mais, melhor.
5. Os nomes podem variar um pouco no site. Se não achar um termo, pule. Não precisa ser perfeito.

> Licença: o Mixamo permite usar em jogos, mas não redistribuir os arquivos soltos — por isso a pasta `vendor/` fica fora
> do Git. Só as animações convertidas para o jogo são publicadas.

## P1 — essenciais (≈ 30)
| Pasta | Buscar | O que escolher | In Place | Link |
|---|---|---|---|---|
| marcio | fighting idle | guarda de briga parado, punhos erguidos | — | [buscar](https://www.mixamo.com/#/?page=1&query=fighting%20idle&type=Motion%2CMotionPack) |
| marcio | walking | caminhada masculina firme | sim | [buscar](https://www.mixamo.com/#/?page=1&query=walking&type=Motion%2CMotionPack) |
| marcio | running | corrida | sim | [buscar](https://www.mixamo.com/#/?page=1&query=running&type=Motion%2CMotionPack) |
| marcio | sprint | corrida rápida | sim | [buscar](https://www.mixamo.com/#/?page=1&query=sprint&type=Motion%2CMotionPack) |
| marcio | jab | jab rápido | — | [buscar](https://www.mixamo.com/#/?page=1&query=jab&type=Motion%2CMotionPack) |
| marcio | cross punch | direto/cruzado | — | [buscar](https://www.mixamo.com/#/?page=1&query=cross%20punch&type=Motion%2CMotionPack) |
| marcio | hook punch | gancho | — | [buscar](https://www.mixamo.com/#/?page=1&query=hook%20punch&type=Motion%2CMotionPack) |
| marcio | uppercut | uppercut | — | [buscar](https://www.mixamo.com/#/?page=1&query=uppercut&type=Motion%2CMotionPack) |
| marcio | punch combo | sequência de socos | — | [buscar](https://www.mixamo.com/#/?page=1&query=punch%20combo&type=Motion%2CMotionPack) |
| marcio | elbow | cotovelada | — | [buscar](https://www.mixamo.com/#/?page=1&query=elbow&type=Motion%2CMotionPack) |
| marcio | headbutt | cabeçada | — | [buscar](https://www.mixamo.com/#/?page=1&query=headbutt&type=Motion%2CMotionPack) |
| marcio | kick | chute frontal / MMA kick | — | [buscar](https://www.mixamo.com/#/?page=1&query=kick&type=Motion%2CMotionPack) |
| marcio | roundhouse kick | chute giratório | — | [buscar](https://www.mixamo.com/#/?page=1&query=roundhouse%20kick&type=Motion%2CMotionPack) |
| marcio | dodge | esquiva lateral/para trás | — | [buscar](https://www.mixamo.com/#/?page=1&query=dodge&type=Motion%2CMotionPack) |
| marcio | roll | rolamento curto | — | [buscar](https://www.mixamo.com/#/?page=1&query=roll&type=Motion%2CMotionPack) |
| marcio | throw | arremesso (de objeto ou pessoa) | — | [buscar](https://www.mixamo.com/#/?page=1&query=throw&type=Motion%2CMotionPack) |
| marcio | brutal assassination | finalização corpo a corpo | — | [buscar](https://www.mixamo.com/#/?page=1&query=assassination&type=Motion%2CMotionPack) |
| reacoes | head hit | reação a soco na cabeça | — | [buscar](https://www.mixamo.com/#/?page=1&query=head%20hit&type=Motion%2CMotionPack) |
| reacoes | stomach hit | reação a golpe na barriga | — | [buscar](https://www.mixamo.com/#/?page=1&query=stomach%20hit&type=Motion%2CMotionPack) |
| reacoes | hit reaction | reações variadas (baixe 3) | — | [buscar](https://www.mixamo.com/#/?page=1&query=hit%20reaction&type=Motion%2CMotionPack) |
| reacoes | stunned | atordoado/cambaleando | — | [buscar](https://www.mixamo.com/#/?page=1&query=stunned&type=Motion%2CMotionPack) |
| reacoes | knocked down | derrubado | — | [buscar](https://www.mixamo.com/#/?page=1&query=knocked%20down&type=Motion%2CMotionPack) |
| reacoes | getting up | levantar do chão (de costas e de bruços) | — | [buscar](https://www.mixamo.com/#/?page=1&query=getting%20up&type=Motion%2CMotionPack) |
| reacoes | dying | mortes variadas (baixe 3–4) | — | [buscar](https://www.mixamo.com/#/?page=1&query=dying&type=Motion%2CMotionPack) |
| inimigos | taunt | provocação | — | [buscar](https://www.mixamo.com/#/?page=1&query=taunt&type=Motion%2CMotionPack) |
| inimigos | strafe | andar de lado em guarda (esq. e dir.) | sim | [buscar](https://www.mixamo.com/#/?page=1&query=strafe&type=Motion%2CMotionPack) |
| inimigos | standing melee attack | ataques com arma (horizontal, para baixo, giro) | — | [buscar](https://www.mixamo.com/#/?page=1&query=standing%20melee%20attack&type=Motion%2CMotionPack) |
| lobo | mutant | **todas** as "Mutant…" (idle, walking, run, roaring, swiping, punch, jumping, flexing) | run/walk: sim | [buscar](https://www.mixamo.com/#/?page=1&query=mutant&type=Motion%2CMotionPack) |
| lobo | zombie biting | mordida/devorar | — | [buscar](https://www.mixamo.com/#/?page=1&query=zombie%20biting&type=Motion%2CMotionPack) |
| civis | terrified | medo, encolhido | — | [buscar](https://www.mixamo.com/#/?page=1&query=terrified&type=Motion%2CMotionPack) |
| civis | kneeling | ajoelhado | — | [buscar](https://www.mixamo.com/#/?page=1&query=kneeling&type=Motion%2CMotionPack) |

## P2 — extras que enriquecem (≈ 20)
| Pasta | Buscar | O que escolher | In Place | Link |
|---|---|---|---|---|
| marcio | flying kick | voadora | — | [buscar](https://www.mixamo.com/#/?page=1&query=flying%20kick&type=Motion%2CMotionPack) |
| marcio | knee | joelhada | — | [buscar](https://www.mixamo.com/#/?page=1&query=knee&type=Motion%2CMotionPack) |
| marcio | body block | ombrada/empurrão | — | [buscar](https://www.mixamo.com/#/?page=1&query=body%20block&type=Motion%2CMotionPack) |
| marcio | picking up | pegar objeto do chão | — | [buscar](https://www.mixamo.com/#/?page=1&query=picking%20up&type=Motion%2CMotionPack) |
| marcio | great sword slash | golpe pesado com duas mãos (bastão/guitarra) | — | [buscar](https://www.mixamo.com/#/?page=1&query=great%20sword%20slash&type=Motion%2CMotionPack) |
| marcio | stabbing | facada | — | [buscar](https://www.mixamo.com/#/?page=1&query=stabbing&type=Motion%2CMotionPack) |
| marcio | victory | comemoração após a onda | — | [buscar](https://www.mixamo.com/#/?page=1&query=victory&type=Motion%2CMotionPack) |
| reacoes | falling back death | cair de costas morto | — | [buscar](https://www.mixamo.com/#/?page=1&query=falling%20back%20death&type=Motion%2CMotionPack) |
| reacoes | knocked out | nocaute | — | [buscar](https://www.mixamo.com/#/?page=1&query=knocked%20out&type=Motion%2CMotionPack) |
| inimigos | yelling | gritando/ordenando | — | [buscar](https://www.mixamo.com/#/?page=1&query=yelling&type=Motion%2CMotionPack) |
| inimigos | boxing | boxeador (elite) | — | [buscar](https://www.mixamo.com/#/?page=1&query=boxing&type=Motion%2CMotionPack) |
| inimigos | sword and shield | golpes e bloqueio (shield) | — | [buscar](https://www.mixamo.com/#/?page=1&query=sword%20and%20shield&type=Motion%2CMotionPack) |
| lobo | crawl | engatinhar/correr de quatro | sim | [buscar](https://www.mixamo.com/#/?page=1&query=crawl&type=Motion%2CMotionPack) |
| lobo | zombie scream | grito/rugido | — | [buscar](https://www.mixamo.com/#/?page=1&query=zombie%20scream&type=Motion%2CMotionPack) |
| lobo | battlecry | grito de guerra | — | [buscar](https://www.mixamo.com/#/?page=1&query=battlecry&type=Motion%2CMotionPack) |
| civis | scared | assustado olhando em volta | — | [buscar](https://www.mixamo.com/#/?page=1&query=scared&type=Motion%2CMotionPack) |
| civis | praying | implorando/rezando | — | [buscar](https://www.mixamo.com/#/?page=1&query=praying&type=Motion%2CMotionPack) |
| civis | cheering | comemorando | — | [buscar](https://www.mixamo.com/#/?page=1&query=cheering&type=Motion%2CMotionPack) |
| civis | crouch | agachar/esconder | — | [buscar](https://www.mixamo.com/#/?page=1&query=crouch&type=Motion%2CMotionPack) |
| civis | running scared | correndo em pânico | sim | [buscar](https://www.mixamo.com/#/?page=1&query=scared%20run&type=Motion%2CMotionPack) |
| boss | old man | idle/andar de velho (base para o Clóvis) | walk: sim | [buscar](https://www.mixamo.com/#/?page=1&query=old%20man&type=Motion%2CMotionPack) |
