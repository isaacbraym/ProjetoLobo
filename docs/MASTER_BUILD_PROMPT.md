# MASTER_BUILD_PROMPT — Construção do jogo "Márcio" (Projeto Lobo)

> **Como usar:** abra uma sessão nova do Claude Code (Opus 5.5) com diretório de trabalho `C:\PROJETOS\Lobo` e envie:
> *"Leia `docs/MASTER_BUILD_PROMPT.md` e execute."* Este arquivo é o contrato. Os outros docs em `docs/` são o detalhe.

---

## 0. Autorização de push/deploy (o usuário preenche antes de enviar)
```
AUTORIZACAO_PUSH_DEPLOY = SIM
```
- `NAO` (padrão): commits locais à vontade; **nunca** `git push` nem deploy. Ao fim de cada milestone, deixe pronto
  e pergunte no `PENDENCIAS.md` + mensagem final.
- `SIM`: pode dar `git push origin main` para `https://github.com/isaacbraym/ProjetoLobo` **somente** com `npm run verify`
  PASS, e o workflow publica no GitHub Pages. Nunca force push, nunca reescrever histórico.

---

## 1. Missão
Construir, no navegador, um **jogo 3D de ação brutal e completo** — não um tech demo — que faça quem joga pensar
**"não é possível que uma IA tenha feito isso"**. Márcio, um anti-herói parrudo de barba grisalha, invade um prédio
corporativo tomado por criminosos, sobe 3 andares, derrota 3 bosses (o primeiro é **Clóvis B.**) e, quando a raiva enche,
vira o **Lobisomem Márcio**. Bonito, frenético, violento, extremamente responsivo, muito bem animado, rodando a **60 FPS
num notebook RTX 3050 4 GB** e jogável em **celular na horizontal**.

O coração do jogo é **PERSONAGENS + MOVIMENTO + IMPACTO**. O prédio é palco.

### Prioridades em conflito (do usuário, nesta ordem)
1. sensação do combate · 2. Márcio · 3. animações · 4. inimigos · 5. Lobisomem · 6. câmera · 7. ambiente · 8. física ·
9. bosses · 10. som · 11. destruição · 12. efeitos secundários.
"10 animações excelentes > 50 ruins." "Personagem ótimo lutando bem num ambiente mais simples ainda impressiona;
cenário perfeito com personagem ruim falha."

---

## 2. Leia primeiro (nesta ordem, uma vez por sessão)
1. `AGENTS.md` (regras curtas) → 2. `docs/PROJECT_STATE.md` (onde parou) → 3. `PENDENCIAS.md` →
4. este arquivo inteiro → 5. sob demanda: `docs/ARCHITECTURE.md`, `docs/ASSET_PIPELINE.md`, `docs/GAME_DESIGN.md`,
`docs/PERFORMANCE_PLAN.md`, `docs/DEVELOPMENT_ROADMAP.md`, `docs/RISK_REGISTER.md`, `docs/TECH_STACK_DECISION.md`,
`docs/ANALYSIS.md`. Em dúvida sobre intenção do usuário: `docs/ORIGINAL_BRIEF.md` vence.

---

## 3. Decisões já tomadas (não reabrir sem motivo forte registrado em `docs/DECISIONS.md`)
| Tema | Decisão |
|---|---|
| Stack | **TypeScript estrito + Vite + Three.js (WebGLRenderer/WebGL2) + `postprocessing` + Rapier3D-compat + recast-navigation + three-mesh-bvh + zod**; UI em DOM/CSS; áudio WebAudio próprio; Vitest + Playwright. Versões fixadas no `package.json` |
| Assets | **Blender 4.2 headless** (`C:\Program Files\Blender Foundation\Blender 4.2\blender.exe`) + **MPFB2 2.0.17** em perfil isolado (`BLENDER_USER_RESOURCES=C:\Ferramentas\Blender-spike-profile`); glTF-Transform + KTX2 (`toktx` em `tools/bin/`) + Meshopt |
| Esqueleto | Único para todos os humanos: MPFB2 `game_engine` (53 ossos, nomes estilo UE). Lobisomem = malha do Márcio + morph targets |
| Rosto | **Técnica "Face Photo" estilo WWE 2K** (landmarks MediaPipe → ajuste linear de modificadores MPFB2 → RBF → projeção da foto → mistura com pele) — `ASSET_PIPELINE.md` §3. **Proibido** usar serviços de imagem→3D de terceiros (decisão do usuário) |
| Animações | **100% automático primeiro**: Quaternius UAL 1+2 (CC0) + CMU (BVH) + autoria por script + procedural. **Mixamo** como reforço: o usuário baixa a lista de `docs/MIXAMO_DOWNLOAD_LIST.md` para `assets-src/vendor/mixamo/`; quando os arquivos aparecerem, integre e substitua as piores |
| Hospedagem | Repo **público** `isaacbraym/ProjetoLobo` → **GitHub Pages** por GitHub Actions. Sem COOP/COEP (sem threads). Sem Git LFS. Jogo ≤ 150 MB |
| Senha | Gate de senha. **A senha em texto vive só em `.env.local` (`LOBO_PASSWORD=...`, fora do Git — nunca escreva a senha em doc, código, commit ou bundle).** `npm run gate:hash` lê o `.env.local` e gera `src/presentation/ui/gateHash.ts` com sal aleatório + `SHA-256(sal + senha)` (esse arquivo é versionado; o CI usa ele, sem segredo). Não exponha a senha via `import.meta.env`. Barreira casual, aceita pelo usuário. Nenhum asset pesado antes da senha. Pular o gate só em dev/localhost com `?autotest=1` |
| Privacidade | `refs/` (fotos reais e áudio original) **nunca** no Git. Só derivados processados em `public/assets/` |
| Áudio da transformação | `assets-src/audio/sfx_transform_fala_lobinho.mp3` (**1,25 s**, 48 kHz estéreo) — toca no **close frontal** da transformação e **abafa forte a música** (ducking −18 dB, ataque 40 ms, liberação 600 ms + passa-baixa) |
| Skin extra | **Márcio Herói** (`refs/marcio_hero/marcio_hero_front.png`): traje verde/amarelo/azul com capa física, desbloqueado ao zerar |
| Boss 1 | **Clóvis B.** (`refs/clovis/clovis_face.png`, `refs/clovis/clovis_body.jfif`): careca, **sorriso arregalado permanente** (é a expressão dele), blazer branco, camiseta listrada azul-marinho/branca, **bengala = arma principal**, **perna que vira cobra = arma secundária** (fase 2) |
| Bosses 2 e 3 | A definir pelo usuário. Placeholders data-driven ("Brutamontes", "Chefão") substituíveis sem refatorar |
| Idioma | Português do Brasil (UI, docs, commits) |

Referências visuais: `refs/marcio/marcio_front.png` (Márcio: ~45–50 anos, parrudo, barriga, braços fortes, cabelo
preto penteado para trás com entradas, barba cheia grisalha no queixo, sobrancelhas grossas, olhar sério; polo
verde-oliva com friso cinza/branco na gola e mangas, jeans azul, tênis marrom), `refs/marcio_wolf/marcio_wolf_front.png`
(**rosto do Márcio preservado** + orelhas de lobo, nariz preto, presas, olhos âmbar, braços/mãos enormes e peludos com
garras, roupa rasgada com pelo aparecendo).

---

## 4. Como trabalhar (o ciclo agent-first)
```
IMPLEMENTAR → RODAR → TESTAR → OBSERVAR (capturas + perf + console) → CORRIGIR → MELHORAR → REPETIR
```
1. **Comece cada tarefa pelo critério de saída** (do milestone) e por como vai verificá-lo.
2. Implemente em passos pequenos; rode `npm run verify:quick` a cada passo relevante, `npm run verify` ao fechar algo.
3. **Olhe as capturas** (abra os PNGs com a ferramenta de leitura de imagem). "Build passou" não é evidência. Use o
   navegador embutido/Playwright para jogar cenários e o **bot** para testes longos.
4. Corrija o que vê. Compare com a referência e com o checklist de qualidade (§13). Itere até ficar bom, não até "funcionar".
5. **Commit pequeno e frequente** (`tipo(área): descrição`, ex.: `feat(combat): cadeia de 4 leves com warp`) com
   `verify:quick` verde. Fim de milestone: `verify` completo + evidências + atualizar `docs/PROJECT_STATE.md`.
6. Não validou? Escreva **NÃO VALIDADO** no estado/commit. Nunca "deve funcionar".
7. **Regra das 3 tentativas:** a mesma abordagem falhou 3 vezes → pare, registre em `docs/DECISIONS.md`, troque de
   abordagem ou use o fallback do `RISK_REGISTER.md`.
8. **Mesmo erro 2 vezes → vira teste, validador ou regra** no `AGENTS.md`.
9. **Perguntas ao usuário não bloqueiam:** escreva em `PENDENCIAS.md` (pergunta + padrão seguro assumido) e siga.
   Só pare de verdade para: autorização de push (se `NAO`), algo destrutivo, ou dependência paga/login.
10. **Subagentes** só para trabalho realmente independente com escopo de arquivos separado (ex.: pipeline de rosto em
    `tools/face/` + `assets-src/characters/` enquanto você faz combate em `src/game/combat/`). Você integra e verifica.
11. Sessão longa: atualize `docs/PROJECT_STATE.md` ao fim de cada milestone e a cada ~2 h de trabalho, para que outra
    sessão retome sem esta conversa.

---

## 5. Harness obrigatório (construir no M0, antes de gameplay)
| Comando | Faz |
|---|---|
| `npm run dev` | Vite com HMR (`--host` para testar no celular na rede local) |
| `npm run validate:data` | Valida todo `data/**/*.json` nos schemas zod |
| `npm run test` | Vitest (combate, tokens, durabilidade, barra do lobo, FSM de animação, schemas) |
| `npm run assets:build [alvo]` | Roda pipeline (Blender/Node) do alvo; um Blender por vez; relatórios JSON |
| `npm run assets:check` | Manifesto × hashes das fontes × orçamentos (falha se divergir/estourar) |
| `npm run verify:quick` | typecheck → validate:data → test → lint de imports (`game`/`engine` nunca importam `dev`) |
| `npm run verify` | quick → build → assets:check → e2e smoke (Playwright) → cenários → capturas → comparação visual → `report.json` |
| `npm run capture [cena]` | Capturas de câmeras fixas (seed fixa) em `.agent-tmp/captures/` |
| `npm run perf` | Cenário `perf-stress` com GPU real → `perf.json` vs `tests/baselines/perf.json` |
| `npm run gate:hash` | Lê `LOBO_PASSWORD` do `.env.local` (fora do Git) e gera `src/presentation/ui/gateHash.ts` (sal + hash) |
| `npm run deploy:check` | Build de produção + checagem de tamanho total, do gate de senha e de que a senha em texto **não** aparece em `dist/` nem no Git |

**Relatório:** `.agent-tmp/verify/<data-hora>/report.json` com etapas, tempos, erros (arquivo/linha/asset), capturas,
diffs visuais e perf; resumo curto no terminal; código de saída ≠ 0 em falha.

**API de debug** (`src/dev/debugApi.ts`, só em dev/autotest): `window.__LOBO__ = { state(), spawn(archetype, opts),
kill(id), teleport(pos), setTimeScale(x), godMode(on), giveWeapon(id), setWolfMeter(v), transform(), runScenario(name),
camera(preset), screenshot(name), perf(), seed(n), loadScene(name) }`.

**Cenas sandbox** (`?scene=`): `sandbox-combat` (sala + 3 thugs), `sandbox-arena` (10 variados), `anim-viewer` (todas as
animações de um ator, com lista e velocidade), `char-viewer` (giro 360° de personagem com luz do jogo), `face-compare`
(foto × render × sobreposição), `transform-test` (transformação em loop), `perf-stress`, `floor1`…`floor3`.

**Bot de teste** (`src/dev/botPilot.ts`): anda até o inimigo mais próximo, usa combos/esquiva/agarrão/armas/lobo com
aleatoriedade com seed. Usado nos cenários e no percurso dos andares (detecta softlock: sem progresso por 30 s = falha).

**Cenários e2e mínimos:** `smoke` (carrega, gate, menu, entra no jogo, 10 s sem erro), `gate-network` (nada pesado antes
da senha), `combat-3` (bot vence 3 thugs < 60 s), `tokens` (nunca mais atacantes que o permitido), `corpses-visible`
(30 mortes, nenhum corpo some na tela), `transform` (transformação completa, áudio de voz tocou, música abafou),
`floorN-walkthrough` (a partir do M6), `mobile-layout` (emulação iPhone/Android landscape e portrait).

**Revisão visual** (o agente faz, olhando capturas): sem T-pose, sem pé deslizando/atravessando chão, sem z-fighting,
silhueta legível, luz com contraste e cor (nada de sala cinza chapada), personagens destacados do fundo, HUD sem cobrir a
ação, sangue/efeitos sem lotar a tela, Márcio reconhecível.

---

## 6. Arquitetura (resumo — detalhe em `docs/ARCHITECTURE.md`)
- Camadas `src/core ← src/engine ← src/game ← src/presentation`; `src/dev` vê tudo e **ninguém importa `dev`**.
- **Passo fixo 60 Hz** + render interpolado; hitstop local; time dilation curto em finalizações.
- **Dados dirigem conteúdo** (`data/**`): ataques (frame data, hitbox, warp, cancelamentos, feedback), combos, arquétipos,
  variação visual, armas, materiais/props, bosses, encontros/níveis, dificuldade, presets, áudio/música, lobisomem,
  ragdoll, civis, cinemáticas. Novo inimigo/arma/prop = JSON.
- **Eventos tipados** desacoplam sistemas (`HitLanded`, `Killed`, `FinisherStarted`, `WolfStart`, `EncounterClear`…).
- Composição (entidade + componentes), herança ≤ 2 níveis, sem alocação no hot path, pools para tudo que nasce/morre,
  IA a 10 Hz escalonada, LOD de animação/IA/física.
- Camada de animação própria sobre `AnimationMixer`: AnimGraph em dados, blendspaces, máscara de parte superior,
  aditivo, **eventos de animação** (o combate usa eventos, não timers), root motion, **motion warping**, IK de 2 ossos,
  olhar procedural, LOD de taxa.
- IA: FSM + utilidade por arquétipo + **CombatDirector** (tokens de ataque, slots em anéis, telegrafia obrigatória) +
  navmesh/crowd por andar.
- Física: camadas de colisão explícitas; ragdoll de 11 corpos com limites por osso; corpos em 3 tiers (ragdoll → pose
  congelada → malha baked mesclada por zona); desmembramento por peças pré-separadas + escala de osso; destruição por
  tabela de materiais + fratura pré-calculada.
- Invariantes L-01…L-11 do `ARCHITECTURE.md` §15 viram testes no `verify`.

---

## 7. Assets (resumo — detalhe em `docs/ASSET_PIPELINE.md`)
- **Leia antes de escrever do zero** (outro projeto, somente leitura): `C:\PROJETOS\Projeto_Bairro\Spike\ENG-001\Shared\`
  `Humanoid\make_humanoid.py`, `Anim\retarget_anims.py`, `Anim\fetch_sources.py`, `Anim\asf_amc.py`, `Automation\*.py`.
  Eles já geraram humanoide MPFB2 e retargetaram CMU/Quaternius com 0 intervenção. Não edite nada lá.
- Todo script Blender: headless, args explícitos, `*.report.json`, valida a própria saída (ossos, escala, altura, tris,
  clips) e sai com erro se falhar. Um Blender por vez.
- **Márcio:** corpo por silhueta (§2), rosto WWE 2K (§3, metas: erro ≤ 3% interocular, SSIM ≥ 0,80 + revisão visual de
  5 vistas), roupas por **cascas do corpo com textura projetada** (§4), cabelo/barba com volume (cascas + alfa).
- **Lobisomem:** mesma malha + morphs `wolf_body`/`wolf_face` + orelhas/garras extras + shells de pelo (1 draw call) +
  roupa rasgando por máscara + olhos âmbar; tudo por `wolfAmount` 0→1 com curvas em `data/cinematics/transform.json`.
- **Inimigos/civis:** 4–6 corpos-base + morphs de rosto/corpo aleatórios por instância + roupas/cabelos/acessórios/tint/
  tatuagens + **mesclagem em runtime** em 1–2 `SkinnedMesh` com atlas.
- **Animação:** CC0/CMU retargetadas offline → `anim_polish` (loop, foot-lock, root motion, **retime de golpes** para ficar
  seco, espelhamento) → autoria por script com **contact sheet** para o que falta (finalizações, transformação, galope,
  devorar, golpes de boss). Mixamo quando o usuário entregar.
- **Níveis:** planta em JSON → gerador Blender → materiais CC0 (ambientCG/Poly Haven) → **lightmap baked em Cycles na
  RTX** + probes → GLB fatiado por sala + colisão + navmesh; overrides em texto.
- **Áudio:** SFX CC0/royalty-free + síntese; música metal CC0/CC-BY com BPM/loop medidos; tudo em `CREDITS.md`.
- **Otimização:** KTX2 + Meshopt + texturas por preset; `manifest.json` com hash da fonte; orçamentos por classe.

---

## 8. Ordem de execução (milestones — detalhe e critérios em `docs/DEVELOPMENT_ROADMAP.md`)
| # | Milestone | Saída jogável |
|---|---|---|
| M0 | Fundação + harness | `verify` PASS, sala de teste bonita a 60 FPS, gate de senha, API de debug, cenas sandbox |
| M1 | Personagem + movimento | Márcio v1 andando/correndo com câmera profissional, sem deslize, transições suaves |
| **M2** | **Vertical slice de combate** | Márcio vs 3 thugs com combate gostoso, ragdoll com peso, sangue, corpos persistentes, bot vence |
| M3 | Rosto WWE 2K (paralelo ao M2) | Márcio v2 claramente reconhecível (métricas + revisão visual) |
| M4 | Variedade de combate | 7 arquétipos, variação visual, agarrão/arremesso, finalizações, armas com durabilidade/som, destruição |
| M5 | Lobisomem | Barra, transformação de 2 s com "FALA LOBINHO" e ducking, moveset, devorar, desmembrar, galope |
| M6 | Andar 1 completo | Átrio + salas + arenas com barricadas variadas + reféns + luz baked + música dinâmica + segredos |
| M7 | Boss Clóvis B. | 3 fases (bengala, perna-cobra, frenesi), intro, arena, finalização especial |
| M8 | Mobile + escalabilidade | Toque final, orientação, HUD responsivo, presets Low/Medium afinados, PWA |
| M9 | Andares 2 e 3 + fluxo | Jogo zerável, elevador com pré-carga, bosses placeholder, game over/save, final, skin Herói |
| M10 | Polimento + lançamento | Feel/animação/luz/perf finais, créditos, deploy (se autorizado) |

**Se o tempo apertar:** M2 bem feito vale mais que M6–M9 corridos. Nunca sacrifique feel de combate ou o Márcio por
mais conteúdo. Corte na ordem inversa das prioridades (§1).

---

## 9. Especificação de feel do combate (o requisito nº 1)
- **Responsividade:** input lido todo frame; ação começa no próximo passo lógico; **buffer de 150–200 ms** para o próximo
  golpe; **cancel windows** definidas por evento de animação (cancelar recovery em esquiva sempre; em golpe seguinte
  após `cancelOpen`).
- **Free-flow:** alvo escolhido pela direção do analógico/câmera num cone (peso ângulo × distância); **warp** até a
  distância ideal (≤ 4–5 m) durante a antecipação; Márcio vira para o alvo em ≤ 80 ms. Golpe nunca "no vazio" se há alvo.
- **Variedade:** combos em árvore com variantes por contexto (distância, alvo no chão/de costas/contra parede, arma,
  aleatório ponderado sem repetir a última). O mesmo botão produz sequências diferentes.
- **Impacto ("juice") em todo acerto:** hitstop local (50–120 ms pelo dano), shake por trauma (pequeno no leve, maior no
  pesado; nunca enjoativo), flash no material atingido, partícula de sangue + decal, som em camadas (corpo + whoosh +
  material + sub-grave no pesado), recuo aditivo na vítima, vibração do gamepad, *chromatic aberration* breve no pesado,
  slow-mo curto na última morte da onda.
- **Leitura justa:** inimigo só ataca com token; **telegrafia** (indicador sobre a cabeça + brilho do golpe) com tempo da
  dificuldade; esquiva perfeita = slow-mo 0,3 s + contra.
- **Câmera em combate:** enquadra o grupo, afasta levemente com mais inimigos, nunca entra na parede, close curto em
  finalizações (≤ 1,2 s) e retorno suave.
- **Valores iniciais** em `docs/GAME_DESIGN.md` §4; tunar pelos dados, registrar mudanças grandes em `DECISIONS.md`.
- **Trava de feel:** quando o combate do M2 estiver aprovado, crie um teste de snapshot dos valores-chave (frame data,
  hitstop, buffer, warp). Mudar depois exige justificativa no commit.

---

## 10. Implementações delicadas (orientação objetiva)
- **Ragdoll com peso:** 11 cápsulas, massas por segmento (total ~80 kg), limites por osso (joelho/cotovelo só para um
  lado, pescoço curto), damping angular moderado; na morte, **velocidade inicial = velocidade dos ossos na animação** +
  impulso no osso atingido; gravidade normal; atrito alto no chão. Teste: 100 mortes no cenário, inspecionar capturas.
- **Corpos:** T1 até repousar (≤ 6 s) → T2 (remove física, para o mixer) → T3 (skinning na CPU uma vez com a LOD 2k,
  mescla no lote da zona) quando fora de vista ou distante. **Nunca** remover visível.
- **Desmembramento:** escala do osso → 0, mostra tampa no coto, instancia a peça pré-separada com a pose atual num corpo
  Rapier simples, jato de sangue (partículas) + decal.
- **Transformação (≈ 2,0 s):** timeline em `data/cinematics/transform.json` — 0,00 corte para close frontal + mundo
  0,25× · 0,05 voz "FALA LOBINHO" (ducking + passa-baixa na música) · 0,05–1,30 `wolfAmount` 0→1 (olhos, orelhas,
  nariz, presas, pelo, músculos, garras, rasgo) com luz de borda quente e partículas · 1,30–1,60 câmera abre + rugido +
  onda de choque (derruba num raio de 4 m) · 1,60–2,00 música volta com camada lobo; controle devolvido. Pré-compile todos
  os shaders do lobo no loading.
- **Galope:** entra após 0,4 s de sprint como lobo; FOV +5°, blur radial leve (só borda da tela), poeira, câmera mais
  baixa; atropela inimigos e props; shake mínimo.
- **Gate de senha:** DOM puro; `crypto.subtle.digest('SHA-256')`; `localStorage` com try/catch; teste e2e verifica que
  nenhum GLB/KTX2/áudio é requisitado antes da senha.
- **Orientação mobile:** botão "JOGAR" → `requestFullscreen()` + `screen.orientation.lock('landscape')` em try/catch
  (Android); em iOS/sem suporte → overlay animado "gire o celular" quando em retrato; HUD com `env(safe-area-inset-*)`.
- **Áudio:** `AudioContext` só após gesto; buses music/sfx/voice/ui; ducking por ganho automatizado no bus de música
  quando o bus de voz toca; troca de faixa no próximo compasso (BPM em dados); limite de vozes por categoria.
- **Shaders/compilação:** `renderer.compile()` de todos os materiais do andar no loading (sem travada no primeiro sangue).

---

## 11. Performance (detalhe em `docs/PERFORMANCE_PLAN.md`)
- Metas: **High 60 FPS no DESKTOP_REF** (RTX 3050 4 GB, 1080p) com 10 inimigos em combate; **Medium 45–60 (piso 30)** em
  celular intermediário; Low 30 estável.
- Orçamentos High: frame ≤ 16,6 ms, **draw calls ≤ 400**, tris ≤ 1,5 M, texturas ≤ 700 MB, heap ≤ 350 MB, física ≤ 2 ms,
  IA ≤ 1 ms, animação ≤ 2,5 ms. Medium: draw calls ≤ 180, tris ≤ 500 k, texturas ≤ 250 MB.
- Obrigatório desde o M0: geometria estática mesclada e fatiada por sala, instancing, atlas, mesclagem de personagens,
  culling por zona, LODs, pools, sem alocação por frame, KTX2, sleeping, pré-compilação de shaders, DPR dinâmico.
- `npm run perf` em todo fim de milestone; regressão > 5% de frame/10% de draw calls/50 MB de textura → corrigir antes
  de seguir ou registrar `PERF-DEBT-xxxx` em `docs/DEBT.md`.
- Medição só vale com GPU NVIDIA confirmada pelo renderer; caso contrário marque **NÃO VALIDADO** e registre pendência.

---

## 12. Mobile
Toque: analógico flutuante à esquerda, área de câmera à direita, botões Leve/Pesado/Chute/Esquiva/Contextual/Lobo com
35–45% de opacidade, tamanho ajustável, sem cobrir o centro. Layout testado em emulação Playwright (landscape e
portrait). Performance real em celular: entregue link (`npm run dev -- --host` ou deploy) + checklist para o usuário em
`PENDENCIAS.md`.

---

## 13. Checklist de qualidade ("isso não é um tech demo")
Um milestone visual só fecha se as capturas mostram:
- [ ] Personagens com materiais bons (pele com variação, tecido com normal map, cabelo/barba com volume), nada de
      cápsula, cubo ou cinza chapado.
- [ ] Márcio reconhecível em close (M3+).
- [ ] Iluminação com intenção: contraste, cor (quente/frio), luz de borda nos personagens, sombras de contato.
- [ ] Ambiente com escala e coerência arquitetônica (M6+): mobília plausível, sinalização, detalhes, vida (TVs, plantas,
      papéis no chão depois da briga).
- [ ] Animações sem estalos, sem deslize, com antecipação e follow-through; reações de dano variadas.
- [ ] Combate legível com 6+ inimigos; câmera nunca perde o Márcio.
- [ ] Efeitos com impacto mas sem poluir; sangue persistente com limite.
- [ ] HUD limpo e bonito (tipografia, ícones, animações discretas).
- [ ] Menu e gate de senha com identidade visual (não formulário padrão do navegador).
- [ ] 60 FPS no DESKTOP_REF no cenário do milestone.

---

## 14. Não-regressão
- `verify` é o portão: nunca commitar com `verify:quick` vermelho; nunca fechar milestone com `verify` vermelho.
- Baselines visuais em `tests/baselines/` só mudam com justificativa no commit (`baseline: motivo`).
- Testes de invariantes L-01…L-11 sempre ligados.
- Trava de feel (§9) e baseline de perf (§11).
- Ao tocar em sistema já aprovado, rode o cenário dele e compare capturas antes/depois.

---

## 15. Liberdade criativa (decida sozinho, registre em `DECISIONS.md` se for relevante)
Nome e identidade da facção criminosa e da empresa do prédio; layout exato das salas dentro do programa de cada andar;
segredos e easter eggs; falas escritas em tela; quais finalizações; paleta de cor; design do menu/HUD; música escolhida
entre as fontes livres; detalhes de humor (ex.: roupas do Márcio continuam rasgadas depois da transformação até o fim do
andar). Sempre dentro do tom: **filme de ação exagerado, brutal e engraçado**.

## 16. Proibido
- Tech demo / cápsulas / cubos / sala cinza como entrega.
- Lógica de jogo espalhada sem dados (inimigo codificado um a um).
- Editar à mão asset gerado; versionar `refs/` ou brutos de terceiros; asset sem licença registrada.
- Serviços de imagem→3D de terceiros; criar contas ou logar em serviços (peça ao usuário via `PENDENCIAS.md`).
- Dependência nova de runtime sem registrar motivo; ECS/framework de UI/"manager genérico" especulativo.
- `git push`/deploy sem `AUTORIZACAO_PUSH_DEPLOY = SIM`; force push; reescrever histórico.
- Medir performance com GPU integrada e reportar como válido.
- Declarar pronto sem `verify` + capturas inspecionadas.

## 17. Encerramento de cada sessão
1. `npm run verify` (ou `verify:quick` + motivo se o completo não couber).
2. Atualize `docs/PROJECT_STATE.md`: milestone atual, o que foi feito, evidências (caminhos), o que está **NÃO
   VALIDADO**, próximos 3 passos, riscos que dispararam.
3. Atualize `PENDENCIAS.md` (perguntas novas, resolvidas saem da fila) e `docs/DECISIONS.md`.
4. Commit final da sessão. Mensagem ao usuário: o que dá para jogar agora, como abrir (`npm run dev` → URL), o que precisa
   dele (ex.: baixar Mixamo, testar no celular, autorizar push), e os próximos passos.

**Continue iterando.** Ao fechar um milestone, comece o próximo. Ao terminar todos, volte à prioridade nº 1 (feel do
combate) e melhore. O objetivo não é "terminar a lista": é o jogo ficar impressionante.
