# ARCHITECTURE — Projeto Lobo

Data: 2026-09-30 · Status: **PROPOSTO** · Stack: `TECH_STACK_DECISION.md` (DEC-0001)

## 1. Princípios
1. **Personagens + movimento + impacto primeiro.** Toda decisão de arquitetura serve ao combate e aos personagens.
2. **Dados dirigem conteúdo.** Código implementa *comportamentos*; JSON define *quem* usa *qual* comportamento com *quais*
   números. Novo inimigo/arma/objeto/boss simples = só JSON (boss único = JSON + um script pequeno de padrões).
3. **Camadas com dependência só para baixo:** `core ← engine ← game ← presentation`; `dev` vê tudo, ninguém depende de `dev`.
4. **Simulação em passo fixo (60 Hz), render interpolado.** Determinismo com seed por subsistema → cenários de teste
   reproduzíveis.
5. **Sem alocação no hot path.** Pools para projéteis, partículas, decals, hitboxes, sons, ragdolls, vetores temporários.
6. **Tick por frame exige motivo.** IA decide a 10 Hz (com fase escalonada), civis a 5 Hz, só o movimento interpola a 60.
7. **Composição antes de herança.** Ator = entidade com componentes (`Health`, `Combatant`, `AnimDriver`, `Ragdoll`…).
   Herança no máximo 2 níveis.
8. **Sem camada especulativa.** Nada de "manager genérico para o futuro". Sem multiplayer, sem ECS de biblioteca.

## 2. Estrutura de diretórios (raiz = `C:\PROJETOS\Lobo`)
```
src/
  main.ts                    boot: gate de senha → loader → menu → jogo
  core/                      sem three.js: loop, tempo, rng, eventos, config, pools, math utilitário
    loop.ts  time.ts  rng.ts  events.ts  pool.ts  config.ts  log.ts
  engine/                    integrações técnicas, sem regra de jogo
    render/                  renderer, presets de qualidade, pós, DPR dinâmico, lightmaps, env/probes
    assets/                  loader glTF/KTX2/Meshopt, manifesto, cache, streaming por andar
    physics/                 mundo Rapier, camadas de colisão, queries, ragdoll builder
    anim/                    FSM, blend, camadas/máscaras, aditivo, eventos de animação, IK 2 ossos, root motion, LOD
    audio/                   mixer WebAudio (buses, ducking, crossfade musical), banco de sons, síntese
    nav/                     navmesh (recast), crowd, consultas de caminho
    input/                   teclado/mouse/gamepad/toque → ações abstratas + buffer
    vfx/                     partículas instanced, decals, trails, shells de pelo, shaders utilitários
  game/                      regras de jogo, por domínio
    actors/                  Entity, componentes (Health, Combatant, Poise, Faction…), spawner, registro
    characters/              montagem de personagem modular (corpo + roupas + morphs + tint + merge)
    player/                  controlador do Márcio, estados de movimento, interação
    combat/                  golpes (AttackDef), hitboxes, resolução de dano, hitstop, alvo/lock suave, warp,
                             combos, contra-ataque, agarrão/arremesso, finalizações
    werewolf/                barra, transformação, moveset, devorar, desmembramento, corrida quadrúpede
    weapons/                 armas improvisadas, durabilidade, quebra
    ai/                      cérebro por arquétipo, CombatDirector (tokens/slots), percepção, comportamentos
    bosses/                  BossController genérico + scripts por boss (clovis.ts, boss02.ts, boss03.ts)
    civilians/               reféns, medo/esperança, fuga, reações
    destruction/             objetos destrutíveis, materiais, integridade, debris
    corpses/                 tiers de corpo (ragdoll → congelado → baked), sangue persistente
    levels/                  andares, zonas, encontros, arenas/barricadas, checkpoints, gatilhos, TVs
    progression/             vidas, game over, desbloqueio de andar, save local, skins, dificuldade
  presentation/
    camera/                  câmera 3ª pessoa, colisão, enquadramento de grupo, cinemática, shake (trauma)
    ui/                      DOM: gate de senha, menus, HUD, barras sobre cabeças, prompts, toque, orientação
    cinematics/              sequências curtas (intro de boss, transformação, finalizações) por timeline em dados
  dev/                       NUNCA importado por game/: API de debug, cenas sandbox, cenários, overlay de perf, bot
    debugApi.ts  scenes/  scenarios/  perfOverlay.ts  botPilot.ts
data/                        fonte da verdade do conteúdo (JSON + schemas zod em src/game/**/schema.ts)
  combat/attacks/*.json  combat/combos.json  enemies/archetypes.json  enemies/variation.json  weapons.json
  props/materials.json  props/props.json  bosses/*.json  levels/floor1/*.json …  difficulty.json  quality.json
  audio/bank.json  audio/music.json  werewolf.json  physics/ragdoll_humanoid.json  civilians.json  cinematics/*.json
tools/
  blender/                   scripts headless (ver ASSET_PIPELINE.md)
  pipeline/                  node: build de assets, otimização, KTX2, manifesto, orçamento, --check
  verify/                    verify.ts (orquestrador), capture.ts, scenarios.ts, perf.ts, report
tests/
  unit/                      Vitest: matemática de combate, tokens, durabilidade, barra, schemas, FSM
  e2e/                       Playwright: smoke, cenários, captura, perf
  baselines/                 PNG + JSON de câmera/tolerância
public/
  assets/                    runtime gerado (glb, ktx2, ogg/m4a, navmesh.bin, lightmaps) + manifest.json
  videos/                    (opcional) mp4 curtos substituíveis para TVs
```

## 3. Fluxo de inicialização
1. `index.html` mínimo (≤ 50 KB) → **gate de senha** (DOM puro, nenhum asset pesado ainda).
2. Senha validada: `SHA-256(sal + entrada) === HASH` (sal e hash em `src/presentation/ui/gateHash.ts`, gerado por
   `npm run gate:hash` a partir do `.env.local`, que fica fora do Git; a senha em texto nunca entra em código nem bundle). Grava `localStorage.lobo_ok`
   (com try/catch). O gate só é pulado com `?autotest=1` **e** host local (`localhost`/`127.0.0.1`) — nunca no deploy.
3. Loader: Rapier WASM + assets do menu e do personagem (≤ 15 MB) com barra de progresso.
4. Menu (Jogar / Continuar / Dificuldade / Qualidade / Controles / Créditos; skin herói quando desbloqueada).
5. "Jogar" (gesto do usuário): libera `AudioContext`, pede fullscreen + `screen.orientation.lock('landscape')`
   (try/catch; iOS cai no overlay), carrega o andar 1 (streaming em segundo plano do resto).

## 4. Loop e ordem de atualização (passo fixo 1/60 s, máx. 4 passos por frame)
```
input.poll()                         → ações + buffer
for each fixed step:
  player.update(dt)                  → intenções de movimento/ataque
  ai.director.update(dt)             → tokens/slots (10 Hz efetivo, fase escalonada)
  ai.brains.update(dt)               → decisões (10 Hz), steering (60 Hz)
  nav.crowd.update(dt)
  combat.update(dt)                  → golpes ativos, hitboxes vs hurtboxes, dano, hitstop (congela dt local)
  werewolf/weapons/destruction/civilians.update(dt)
  physics.step(dt)                   → Rapier (ragdolls, debris, props)
  corpses.update(dt)                 → promoção/rebaixamento de tier
  levels.update(dt)                  → gatilhos, encontros, barricadas
anim.update(frameDt, lod)            → mixers (taxa por LOD), IK, root motion já aplicado no passo
camera.update(frameDt)
vfx.update(frameDt); audio.update(frameDt); ui.update(frameDt)
render(alpha)                         → interpolação de transformações de atores
```
**Hitstop** é local: os atores envolvidos param o relógio de animação por N ms (50–120), o resto do mundo segue; em
finalizações há *time dilation* global curto (0,2–0,35× por ≤ 400 ms).

## 5. Animação (`engine/anim`)
Three.js fornece `AnimationMixer`/`AnimationAction`. Por cima, construímos uma camada pequena:
- **`AnimGraph` por arquétipo em dados** (`data/anim/*.json`): estados (idle, locomotion blendspace 1D/2D, attack,
  hitReact, stagger, knockdown, getUp, grabbed, dead…), transições com duração de crossfade e condições.
- **Blendspace de locomoção** 1D (velocidade) para inimigos e 2D (direção × velocidade) para Márcio em combate (strafe).
- **Camadas:** base (corpo todo) + parte superior (máscara por filtro de trilhas: clips derivados só com ossos de
  `spine_01` para cima) + **aditivo** (reações leves de dano, respiração, recuo) via `AnimationUtils.makeClipAdditive`.
- **Eventos de animação** (`data/anim/events.json`): por clip, tempos normalizados de `hitStart`, `hitEnd`,
  `cancelOpen`, `footstep`, `whoosh`, `vfx`, `camShake`. O combate usa **eventos**, não timers soltos.
- **Root motion:** extraído no pipeline (osso `root`), aplicado pelo controlador com colisão (Rapier
  `KinematicCharacterController`). Clips de locomoção são *in place* + velocidade do blendspace (sincronizada com a
  cadência dos pés para não deslizar).
- **Motion warping:** durante a janela de aproximação do golpe, o deslocamento é ajustado para terminar a distância
  ideal do alvo (o segredo do combate "free-flow" bonito).
- **IK de 2 ossos** para pés (raycast no chão, só para atores próximos e só em idle/caminhada) e para mão em agarrões.
- **Procedural:** olhar para o alvo (cabeça/pescoço com limites), inclinação na curva, *lean* ao acelerar.
- **LOD de animação:** perto = 60 Hz; médio = 30 Hz; longe = 15 Hz; fora da tela = 0 (só posição). Configurável por preset.
- **Retarget:** feito **offline** no Blender para o esqueleto único (MPFB2 `game_engine`, 53 ossos, nomes estilo UE).
  Runtime nunca retargeta.

## 6. Combate (`game/combat`)
- **AttackDef** (dado): `id, clip, startup/active/recovery (ms), damage, poiseDamage, knockback {type, force},
  hitstopMs, hitbox {bone, shape, radius, length}, range, warp {maxDist}, cancelInto[], camShake, sfx, vfx, tags[]`.
- **Combos** (dado): árvore curta por entrada (`L, L, L, L`; `L, L, H`; `H` carregado; `K`; `L` + direção…). Cada nó
  escolhe **variante por contexto** (distância, alvo no chão/de costas/encurralado contra parede, arma equipada, aleatório
  ponderado sem repetir a última). Resultado: o mesmo botão gera sequências diferentes.
- **Alvo suave (free-flow):** a direção do analógico + câmera escolhem o melhor alvo num cone (peso por ângulo e
  distância). Márcio "salta" até o alvo com warp. Sem lock duro obrigatório.
- **Contra-ataque/esquiva perfeita:** inimigo telegrafa (indicador sobre a cabeça + brilho no golpe); esquiva no tempo
  certo = slow-mo curto + contra-golpe contextual. (Adição ao brief para dar camada de habilidade simples.)
- **Agarrão:** botão contextual; a partir do agarrão: socos curtos, arremesso direcional (contra parede/mesa/inimigos =
  dano e destruição em cadeia), ou finalização se o alvo estiver fraco.
- **Finalizações:** inimigo com HP ≤ limiar ou em stagger mostra prompt; executa uma das finalizações compatíveis
  (seleção por arquétipo, arma, lado, proximidade de parede/mesa). Câmera cinematográfica curta (≤ 1,2 s), slow-mo leve,
  invulnerabilidade durante a execução, inimigos ao redor recuam (não atacam).
- **Dano e poise:** cada golpe tira HP e "poise"; poise zerado = stagger/knockdown. Heavy tem poise alto.
- **Feedback (o "juice"):** hitstop, shake por trauma, flash no material atingido, sangue (partícula + decal), som em
  camadas (corpo + whoosh + material), vibração do gamepad, *chromatic aberration* breve em golpes pesados.
- **Contrato de evento** (`core/events.ts`, tipado): `HitLanded, Killed, FinisherStarted, PlayerDamaged, WeaponBroken,
  PropDestroyed, CivilianHurt, WolfMeterFull, WolfStart, WolfEnd, BossPhase, EncounterStart/Clear…`. Sistemas como
  barra do lobisomem, música, civis e UI **ouvem eventos**; o combate não conhece nenhum deles.

## 7. IA (`game/ai`)
- **Cérebro por arquétipo** (FSM hierárquica simples + pontuação de utilidade para escolher o próximo ataque):
  `Idle/Guard → Alert → Engage{Approach, Circle, Wait/Taunt, Attack, Retreat} → HitReact/Stagger/Knockdown/GetUp → Dead`.
- **CombatDirector (global por encontro):**
  - **Tokens de ataque:** no máximo N atacantes simultâneos (Fácil 1, Normal 2, Difícil 3; Elite/Heavy "custam" mais).
    Sem token = não ataca, circula ou provoca. Tokens têm cooldown e prioridade (quem está no campo de visão do jogador
    e perto ganha; quem atacou há pouco espera).
  - **Slots de engajamento:** anel interno (8 slots a ~2 m) para quem tem token; anel externo (8–12 slots a ~4,5 m) para
    os demais; armados/arremessadores em anel distante. Alocação por menor custo com histerese (evita troca nervosa).
  - **Telegrafia obrigatória** antes de cada ataque (tempo por dificuldade) — leitura justa para o jogador.
- **Arquétipos** (`data/enemies/archetypes.json`): `thug, fast, heavy, grappler, armed, elite` + `shield` (opcional:
  segura porta/cadeira, precisa de pesado/agarrão) e `thrower` (arremessa objetos do cenário). Cada um: HP, poise,
  velocidade, agressividade, attackSet, weaponSet, behaviorProfile, tier visual (1–3), escala.
- **Percepção:** visão em cone + audição de combate (eventos de impacto num raio alertam a sala).
- **Navegação:** navmesh por andar gerado offline (`public/assets/floorN/navmesh.bin`) + DetourCrowd para separação.
- **Dificuldade** altera: tokens, tempo de telegrafia, frequência/cooldown, dano, composição das ondas, % de elites,
  chance de esquiva do elite, agressividade de flanqueio. **HP muda pouco** (±15%).

## 8. Física, ragdoll, corpos, destruição
- **Camadas de colisão:** `STATIC, PLAYER, ENEMY, CIVILIAN, RAGDOLL, PROP, DEBRIS, TRIGGER, HITBOX` com matriz explícita
  (debris não colide com personagens; ragdoll colide com estático/props).
- **Ragdoll** (`engine/physics/ragdoll.ts` + `data/physics/ragdoll_humanoid.json`): 11 corpos (pelve, 2 coluna,
  cabeça, braço/antebraço ×2, coxa/canela ×2) com cápsulas, massa por segmento (proporção humana, total ~80 kg), juntas
  esféricas/revolutas com **limites por osso** (joelho e cotovelo só dobram para um lado), damping angular moderado.
  Na morte: pose atual → corpos posicionados → **velocidade inicial = velocidade dos ossos na animação** + impulso do golpe
  no osso atingido. Pool por preset (High 6, Medium 3, Low 2); se o pool esgotar, o mais antigo e já quase parado
  "congela" primeiro.
- **Tiers de corpo** (`game/corpses`):
  - **T1 ragdoll ativo** até repousar (velocidade < limiar por 0,5 s) ou até 6 s.
  - **T2 pose congelada:** remove corpos Rapier; mantém `SkinnedMesh` com mixer parado (custo: 1 draw call, 0 física).
  - **T3 baked:** skinning na CPU **uma vez** → `BufferGeometry` estática da LOD baixa (≈2k tris) → mesclada num
    **lote por zona** (1 draw call por material para todos os corpos da zona). Promoção T2→T3 quando fora de vista ou
    distante > X m. **Nunca** removido na frente do jogador; sangue (decal) permanece até o limite do pool de decals,
    reciclando primeiro os fora de vista.
- **Desmembramento:** cada corpo-base tem peças pré-separadas no Blender (cabeça, antebraços, braços, canelas, coxas)
  com tampa de "ferida", ocultas por padrão. Ao desmembrar: escala do osso → 0 no corpo (some o membro), mostra tampa no
  coto, instancia a peça com a pose atual (baked) num corpo Rapier simples + jato de sangue. Limite de peças ativas por
  preset; peças repousadas viram T3.
- **Destruição** (`data/props/materials.json`): material → `{hpPerKg, hitResistance, wolfMultiplier, breakFx, sfx,
  debrisSet}`; props → `{mesh, material, mass, integrity, stages: [intacto, danificado, destruído], breakPieces}`.
  Humano precisa de 3–5 golpes numa mesa de madeira; lobisomem quebra em 1 ou atravessa (dano de impacto ao correr).
  Peças de quebra **pré-fraturadas no Blender** (script de fratura Voronoi), debris viram estáticos após repouso e somem
  só fora de vista se exceder o pool.

## 9. Personagens (`game/characters`)
- **Esqueleto único** para todos os humanos (Márcio, lobisomem, inimigos, civis, bosses): todas as animações servem a todos.
  O lobisomem é a **mesma malha do Márcio com morph targets** + peças extras (garras, orelhas, presas) + shells de pelo.
- **Inimigos/civis modulares:** corpo-base (poucas variantes de MPFB2) + **morph targets de corpo e rosto** com pesos
  aleatórios por instância (variedade "de graça") + roupas (camisa, casaco, calça, sapato) + cabelo/barba/bigode +
  acessórios (boné, touca/balaclava, óculos, corrente, relógio) + tint por instância (paleta em dados) + tatuagens no
  atlas. No spawn, as partes são **mescladas em 1–2 `SkinnedMesh`** (mesmo esqueleto, atlas comum) para 1–2 draw calls.
- **Barra de vida sobre a cabeça:** sprites instanced (um draw call para todas), com tier (1–3 marcas) e cor por
  arquétipo; aparece só em combate/alvo atual.

## 10. Câmera (`presentation/camera`)
Órbita 3ª pessoa com braço de mola, colisão por *sphere cast* (BVH), **enquadramento de grupo** (em combate o pivô
desloca para o centróide ponderado de ameaças próximas e o braço afasta um pouco), *look-ahead* na direção do movimento,
suavização crítica (spring-damper), **shake por trauma** (Perlin, trauma² com decaimento), FOV dinâmico (corrida do lobo +
3–6°), cinemática por timeline em dados (intro de boss, transformação, finalizações) com retorno suave ao gameplay.

## 11. Áudio (`engine/audio`)
Buses: `master → {music, sfx, voice, ui}`; compressor no master. **Ducking:** o bus `voice` (transformação "FALA
LOBINHO") aplica -18 dB na música com ataque de 40 ms e liberação de 600 ms. Música dinâmica por **camadas/faixas com
BPM e compassos em dados**, troca no próximo compasso: `explore → combat → arena → boss`, + camada `wolf` por cima.
SFX: variação de pitch/volume, limite de vozes por categoria, posicionamento 3D (`PannerNode` HRTF só no High+).
Síntese de apoio: whooshes, cordas da guitarra (Karplus-Strong), *sub-hit* grave nos golpes pesados.

## 12. Níveis e streaming (`game/levels`)
Cada andar é gerado de dados (`data/levels/floorN/layout.json` → script Blender → `floorN.glb` com lightmap baked +
colisão simplificada + navmesh). O runtime carrega o andar atual; o próximo é **pré-carregado em segundo plano** quando o
boss entra na fase final; a transição é a **cena do elevador/escada** (esconde o carregamento). Zonas dentro do andar
controlam ativação de IA, civis, áudio ambiente e visibilidade (portas fechadas = salas inteiras fora do render).

## 13. UI, toque e orientação (`presentation/ui`)
HUD mínimo: vida + vidas (canto superior esquerdo), barra do lobisomem (abaixo), arma e durabilidade (pequeno, inferior
direito), prompt contextual central baixo. Toque: analógico flutuante à esquerda, área de câmera à direita, cluster de
botões (Leve, Pesado, Esquiva, Agarrar/Interagir contextual, Lobo quando cheio, Chute), 35–45% de opacidade, tamanho
ajustável. Retrato no celular → overlay "gire o celular" com animação.

## 14. Persistência
`localStorage` (try/catch): progresso por andar, checkpoint, dificuldade, qualidade, volume, skin desbloqueada.
`schemaVersion` + migração simples. Sem nada sensível.

## 15. Invariantes (cada um vira teste automático)
| # | Invariante | Teste |
|---|---|---|
| L-01 | `src/game/**` e `src/engine/**` nunca importam `src/dev/**` | lint de import (script) |
| L-02 | Todo `data/**/*.json` valida no schema | `npm run validate:data` |
| L-03 | Todo asset em `public/assets` está no manifesto com hash da fonte atual | `npm run assets:check` |
| L-04 | Nenhum ataque de inimigo sem telegrafia ≥ mínimo da dificuldade | teste unitário sobre os dados |
| L-05 | Nº de atacantes simultâneos ≤ tokens da dificuldade | teste do CombatDirector com 12 inimigos simulados |
| L-06 | Corpos nunca removidos quando visíveis | cenário e2e: matar 30, girar a câmera, contar corpos visíveis |
| L-07 | Ragdolls ativos ≤ pool do preset | cenário perf-stress |
| L-08 | Nenhum `console.error`/exceção em cenário | smoke e2e |
| L-09 | Gate de senha não carrega assets pesados antes da senha | e2e: inspeciona requisições de rede |
| L-10 | Durabilidade sempre termina em quebra (nenhuma arma eterna) | unitário sobre `weapons.json` |
| L-11 | Clip referenciado em dado existe no GLB carregado | validação no boot dev + verify |
