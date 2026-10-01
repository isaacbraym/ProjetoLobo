# PROMPT — Sessão 2 (autônoma, longa, sem supervisão)

Cole o bloco abaixo numa sessão nova do Claude Code (Opus 5.5, modo "ultracode") aberta em `C:\PROJETOS\Lobo`.

```
Você vai continuar SOZINHO, por muitas horas e SEM NINGUÉM para responder ou aprovar nada, o desenvolvimento do jogo "Márcio" (Projeto Lobo) em C:\PROJETOS\Lobo. Outra sessão já construiu a base (jogável e publicada). Não recomece: retome e eleve o nível. Objetivo desta sessão: SURPREENDER em qualidade visual, otimização, câmera, cinemática de golpes/críticos, animações e no rosto do Márcio.

=== 0. AUTONOMIA TOTAL (leia com atenção) ===
- O usuário NÃO vai estar presente. Ninguém vai aprovar permissões de tela nem responder perguntas.
- NÃO use o navegador embutido (mcp__Claude_Browser__*), Claude in Chrome, nem computer-use: pedem aprovação/tela e vão travar você. Valide TUDO por linha de comando: `npm run capture <cenário>` (Playwright headless, já existe em tools/verify/) + abrir os PNGs com a ferramenta de leitura de imagem + folhas de contato com ffmpeg.
- Use só ferramentas que já funcionam neste projeto: Bash/PowerShell, npm/npx tsx, git, gh, python, ffmpeg, Blender headless (comando em docs/PROJECT_STATE.md). Nada que abra janela.
- Dúvida = decida o padrão seguro, registre em PENDENCIAS.md e siga. Nunca pare esperando resposta.
- Push/deploy está AUTORIZADO (git push origin main com `npm run verify` PASS → GitHub Pages publica sozinho). Nunca force push.
- Portas 5173/4173 são de OUTRO projeto (Karimbolandia) — não mate processos que não são seus. O Lobo usa 5180 (dev) e 4180 (preview).
- Regra das 3 tentativas: mesma abordagem falhou 3x → registre em docs/DECISIONS.md e mude de abordagem.

=== 1. RETOMAR (nesta ordem) ===
1) AGENTS.md → docs/PROJECT_STATE.md (seção "RETOMAR AQUI") → PENDENCIAS.md → docs/MASTER_BUILD_PROMPT.md (contrato) → docs/DECISIONS.md.
2) git log --oneline -30 ; git status ; npm install ; npx playwright install chromium ; npm run verify:quick ; npm run capture combat (e olhe as imagens) — entenda o estado ANTES de mudar.
3) Leia o código principal: src/game/game.ts, src/game/player/player.ts, src/game/ai/enemy.ts, src/game/combat/*, src/engine/anim/*, src/presentation/camera/thirdPersonCamera.ts, src/engine/render/*, tools/blender/build_character.py, tools/blender/retarget_mixamo.py.

=== 2. PRIORIDADES DESTA SESSÃO (em ordem; commit+push ao fim de cada uma) ===

A) ROSTO DO MÁRCIO v2 — NOVA FOTO REAL (prioridade máxima)
- Use a foto real nova: assets-src/characters/marcio_face_src (PNG 659x659 SEM extensão, versionado com autorização do usuário — DEC-0015; cópia também em refs/marcio/marcio_face_real.png). Ela substitui a imagem antiga SÓ para o rosto/cabeça (o corpo/roupa continuam de refs/marcio/marcio_front.png). O que importa para o usuário: O ROSTO FICAR IDÊNTICO.
- O pipeline atual (tools/blender/build_character.py → face_projection) usa 5 pontos marcados à mão em data/characters/marcio.json ("face"). Evolua para a técnica WWE 2K completa (docs/ASSET_PIPELINE.md §3):
  1. Landmarks automáticos: MediaPipe Face Landmarker (@mediapipe/tasks-vision + modelo face_landmarker.task baixado para tools/bin/) rodando numa página local aberta pelo Playwright headless → 478 pontos + pose. Se MediaPipe falhar 3x, marque à mão mais pontos (cantos dos olhos, asas do nariz, cantos da boca, linha da mandíbula, linha do cabelo) olhando a imagem.
  2. Ajuste de GEOMETRIA: modificadores faciais do MPFB2 são lineares → mínimos quadrados para bater a forma (largura do rosto, nariz, boca, olhos, mandíbula) + resíduo por RBF. Hoje só a textura é projetada; a forma é genérica.
  3. Projeção + mistura: delighting leve, color transfer em Lab da pele do corpo para o tom da foto, máscara suave nas bordas, olhos com a foto projetada (já existe), barba com volume (grisalha no queixo, bigode mais escuro, como na foto), cabelo CURTO com entradas e grisalho nas têmporas (como na foto real — hoje o cabelo é uma calota e a borda da frente mostra pele).
  4. Validação automática: render da cabeça → landmarks no render → erro médio normalizado pela distância interocular (meta ≤ 3%) + SSIM do recorte (meta ≥ 0,80) + `npm run capture face` (frente, 3/4, perfil, corpo). Itere até ficar claramente o Márcio de frente e em 3/4.
  - Textura do rosto no jogo: SEM extensão (ex.: public/assets/characters/marcio_f), em resolução alta (use a foto inteira na resolução nativa, sem reduzir), carregada pelo runtime e aplicada no personagem — pedido do usuário para não ficar evidente que é uma foto. O loader de imagem do navegador identifica o formato pelo conteúdo. Remova o antigo marcio_face.jpg quando o novo estiver no lugar.

B) CINEMÁTICA DE ABERTURA (o jogo começa com um filminho)
- Ao clicar JOGAR: letterbox, câmera estabelecendo o saguão do Edifício Vértice → Márcio entra DISTRAÍDO (andando olhando o celular / tomando café — crie o prop por código) → BELO ZOOM no rosto dele (push-in lento, profundidade de campo, luz de borda, foco no rosto da foto real) → bandidos surgem (de trás das colunas/da recepção, um rendendo reféns: clipes mx_hostage_situation_idle_villain / mx_hostage_situation_idle_hostage / mx_kneeling_idle / mx_praying já existem) → Márcio se assusta, fecha a cara (troca para mx_fighting_idle), título "MÁRCIO" estilizado → controle passa ao jogador e a primeira onda começa. 20–35 s, pulável (qualquer tecla/toque após 1 s), legendas curtas em PT-BR com humor de filme de ação.
- Faça data-driven: data/cinematics/intro.json (chaves de câmera pos/look/fov/dof, ações de atores: caminho, clipe, spawn, fala, áudio, cortes). Sistema reutilizável depois para intro do boss Clóvis.
- Capture a sequência (cenário novo `npm run capture intro` com folha de contato de ~12 quadros) e revise como um diretor: enquadramento, ritmo, ninguém atravessando nada, pés no chão.

C) CÂMERA PROFISSIONAL (o usuário pediu para melhorar)
- Reescreva/eleve src/presentation/camera/thirdPersonCamera.ts: molas críticas (sem tremedeira), distância/altura/ombro dinâmicos por velocidade e estado, recentralização suave atrás do Márcio ao andar sem mexer a câmera, enquadramento de combate que inclui o alvo atual + ameaças próximas sem perder o Márcio, assistência de mira suave (lock-on leve) no alvo do free-flow, oclusão elegante (paredes/colunas entre câmera e Márcio ficam transparentes/dithered em vez de a câmera pular), FOV dinâmico na corrida/sprint/lobo, sensibilidades separadas mouse/gamepad/toque, nunca entra em parede, nunca faz movimento brusco.
- Câmera de AÇÃO (sem atrapalhar o jogo): em crítico → punch-in curto + micro slow-mo; última morte da onda → kill-cam em câmera lenta; finalização → 2–3 ângulos cortados; todos com duração máxima curta e retorno suave. Tudo em dados.

D) CINEMÁTICA DE GOLPES E CRÍTICOS (foco do usuário)
- Críticos já existem (DEC-0012: 1,5x, sangue só em crítico/arma branca/fatal). Eleve o espetáculo: texto "CRÍTICO!" estilizado com animação, impact frame (1–2 quadros de flash/silhueta estilo anime) só em crítico/finalização, linhas de velocidade/blur radial curto, hitstop em níveis, perfis de tremor por tipo de golpe, som de crítico mais grave, partículas de impacto melhores.
- Finalizações: mais variedade usando clipes Mixamo (mx_headbutt, mx_illegal_knee, mx_brutal_assassination recortado, mx_flying_kick) com ANIMAÇÃO PAREADA: vítima alinhada ao Márcio tocando reação sincronizada no impacto (mx_head_hit, mx_knocked_down, mx_standing_react_large_gut) antes do ragdoll. Versões do lobisomem (patadas, arremesso longe).
- Valide tudo com sequências de capturas (folhas de contato) e ajuste os tempos pelos dados (public/assets/anims/mixamo_meta.json tem o tempo de impacto medido de cada clipe).

E) ANIMAÇÕES — FLUIDEZ MÁXIMA
- 242 clipes Mixamo já estão retargetados (data/anim/clipmap.json, mixamo_meta.json com velocidades medidas). Melhore: root motion extraído para golpes que dão passo (sem pé deslizando), virar no lugar (mx_right_pivot, mx_mutant_*_turn_*), partida/parada de corrida, reações aditivas da parte de cima enquanto anda, IK de pés no chão para Márcio e inimigos próximos, variantes de corrida (mx_running_1/_2) para inimigos não parecerem clones, crossfades afinados por par de estados. Gere folhas de contato (build_character.py --qa) para cada clipe que usar e confira.
- Se o GLB de animações for regerado: SEMPRE com --mixamo e depois `npx tsx tools/pipeline/optimize-anims.ts`.

F) OTIMIZAÇÃO + QUALIDADE VISUAL (me surpreenda)
- Implemente `npm run perf` (o script tools/verify/perf.ts está no package.json mas NÃO existe): cenário perf-stress com seed fixa, 10 inimigos, lobisomem no meio → perf.json (média, p95, p99, draw calls, tris, heap) + baseline em tests/baselines/perf.json + regra de regressão (>5% frame, >10% draw calls).
- Tente a GPU dedicada no Playwright: adicione `--force_high_performance_gpu` aos args em tools/verify/browser.ts e confira o renderer no perf (hoje cai na Intel Iris Xe). Registre o resultado.
- Download inicial (~31 MB): divida o GLB de animações em núcleo (locomoção+combate, carrega antes do menu) e extra (carrega em segundo plano); textura do rosto em KTX2 ou WebP; nomes com hash/cache.
- Draw calls: personagens têm ~14 peças cada → mescle as que dividem material/esqueleto em runtime; sombras só perto do Márcio (câmera de sombra que segue o jogador); corpos congelados sem sombra (já); tier T3 de corpos (malha baked mesclada, docs/ARCHITECTURE.md §8); auditoria de alocação por frame nos hot paths; pré-compilar todos os shaders (inclui os do lobo e do rosto).
- Visual: pele melhor (wrap lighting/SSS barato), cabelo/barba com anisotropia simples, SSAO só no High+, LUT de cor cinematográfica, granulação sutil, DOF nas cinemáticas, reflexo planar barato no piso do átrio (só High/Ultra), luzes de destaque nos personagens (rim light), ambiente do saguão mais rico (mais props com materiais bons, placas, papéis, luzes quentes/frias). Personagens > cenário.
- Meta: 60 FPS no Medium na Intel Iris Xe com 6 inimigos (se conseguir isso na integrada, na RTX 3050 sobra), e o visual tem que parecer jogo comercial nas capturas.

G) BUGS/DÍVIDAS CONHECIDAS
- Numa captura um corpo pareceu ficar em pé após a morte (talvez morte durante getup/knockdown hold) — reproduza e corrija.
- validate:data não valida data/werewolf.json, data/characters/*.json, data/anim/*.json — adicione schemas.
- Ver "Dívidas conhecidas" em docs/PROJECT_STATE.md.

=== 3. COMO TRABALHAR ===
- Ciclo: implementar → `npm run verify:quick` → `npm run capture <cenário>` → OLHAR as imagens → corrigir → `npm run verify` → commit pequeno (`tipo(área): descrição` + Co-Authored-By) → push.
- Crie cenários de captura novos quando precisar (intro, face, crit, finisher, camera, perf) em tools/verify/capture.ts e use window.__LOBO__ (src/dev/debugApi.ts) para posicionar câmera/inimigos/estado.
- Pode usar subagentes para trabalho realmente independente (ex.: pipeline do rosto no Blender enquanto você faz câmera), mas integre e verifique você mesmo.
- Atualize docs/PROJECT_STATE.md ao fim de cada prioridade e a cada ~2 h (outra sessão pode precisar retomar). Atualize docs/RETOMAR.md se o procedimento mudar. Decisões novas → docs/DECISIONS.md.
- Nunca declare pronto sem verify PASS + capturas inspecionadas. O que não validou: "NÃO VALIDADO" no PROJECT_STATE.
- Ao terminar A–G, volte ao combate (prioridade nº 1 do projeto) e continue melhorando; depois siga o DEVELOPMENT_ROADMAP (andar 1 real, reféns, Clóvis).
- Ao encerrar: verify, PROJECT_STATE completo, commit+push, e um resumo final do que mudou + o que ficou pendente.
```
