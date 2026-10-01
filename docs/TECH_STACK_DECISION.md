# TECH_STACK_DECISION — Projeto Lobo

Data: 2026-09-30 · Status: **PROPOSTO** · Decisão: **DEC-0001**

## Decisão
**TypeScript + Vite + Three.js (WebGLRenderer / WebGL2) + Rapier3D (WASM) + recast-navigation-js**, com pipeline de
assets em **Blender 4.2 headless (Python) + MPFB2** e **glTF-Transform (Meshopt + KTX2)**, harness com **Vitest +
Playwright**, deploy em **GitHub Pages** via GitHub Actions.

## Critérios e notas (0–5; peso entre parênteses)
| Critério | Peso | Three.js + Rapier | Babylon.js + Havok | PlayCanvas | R3F (React) | Godot 4 Web | Unity WebGL |
|---|---|---|---|---|---|---|---|
| Qualidade visual alcançável | 3 | 4 | 4 | 4 | 4 | 3 | 4 |
| **Domínio real do Claude** (menos API inventada) | 5 | **5** | 4 | 2 | 4 | 3 | 3 |
| Automação por código / agent-first (sem editor) | 4 | **5** | 4 | 2 (editor-cêntrico) | 4 | 3 | 1 |
| Debugging (stack JS, devtools, Playwright) | 4 | **5** | 5 | 4 | 3 (reconciliação) | 2 | 1 |
| Física (ragdoll, juntas, sleeping) | 3 | 4 (Rapier) | **5** (Havok) | 3 (Ammo) | 4 | 3 | 4 |
| Animação (blend, camadas, IK) | 4 | 3 (construir camada) | **4** (masks/blend nativos) | 3 | 3 | 4 | 5 |
| Performance Web / tamanho do runtime | 4 | **5** (~170 KB + Rapier ~1,5 MB) | 4 (~1 MB+) | 4 | 4 | 2 (~40 MB wasm) | 1 (pesado) |
| Deploy GitHub Pages (sem COOP/COEP) | 3 | **5** | 5 | 5 | 5 | 3 (só export single-thread) | 2 |
| Mobile | 4 | **5** | 4 | 5 | 4 | 2 | 1 |
| Integração de assets (glTF, KTX2, morphs) | 3 | **5** | 5 | 5 | 5 | 4 | 4 |
| **Total ponderado** (máx. 185) | | **171** | 160 | 125 | 143 | 109 | 95 |

## Por que Three.js (e não Babylon, o segundo colocado)
- **Corpus de treino:** Three.js é de longe a biblioteca 3D Web com mais código público, exemplos e discussões. Para um
  agente que vai escrever dezenas de milhares de linhas sozinho, isso significa **menos alucinação de API** e correções
  mais rápidas. Esse é o critério de maior peso pedido pelo usuário ("o que EU, Opus 5.5, executo melhor").
- **Imperativo e transparente:** tudo é objeto JS inspecionável; o agente controla o loop, a ordem de update e a memória.
  Ótimo para depurar via `window.__LOBO__` e Playwright.
- **Leve:** cabe no orçamento mobile e carrega rápido.
- **Babylon** ganharia em física (Havok) e camadas de animação prontas. Perdemos isso, e pagamos construindo uma
  **camada de animação pequena** (FSM + blend + máscaras por filtro de trilha + aditivo + IK de 2 ossos) — algo que o
  agente faz bem — e usando **Rapier**, que tem juntas, limites, sleeping e CCD suficientes para ragdoll convincente.

## Componentes e motivo
| Peça | Escolha | Motivo | Alternativa descartada |
|---|---|---|---|
| Linguagem/build | TypeScript estrito + Vite | Tipos pegam erros antes do runtime; HMR em segundos; build otimizado | JS puro (sem rede de segurança), Webpack (lento) |
| Render | `THREE.WebGLRenderer` (WebGL2) | Compatibilidade máxima (iOS/Android), maturidade, exemplos | `WebGPURenderer`: promissor, mas pós-processo/shaders TSL têm menos exemplos e mais risco em mobile; reavaliar no M10 (DEC aberta) |
| Pós-processo | `postprocessing` (pmndrs) | Efeitos mesclados num passe (bloom, SMAA, vinheta, LUT, CA), bem mais barato que `EffectComposer` puro | EffectComposer do three (um passe por efeito) |
| Física | `@dimforge/rapier3d-compat` | WASM embutido (sem arquivo extra), juntas com limites, sleeping, CCD, character controller, determinístico | cannon-es (lento, sem manutenção forte), Ammo (API ruim), Jolt-wasm (bom, menos exemplos) |
| Navegação | `recast-navigation` (JS/WASM) | Navmesh + DetourCrowd (desvio entre agentes) — exatamente o que IA em grupo precisa | A* em grade própria (sem crowd), Yuka (sem navmesh real) |
| Raycast/colisão de cenário | `three-mesh-bvh` | Raycast rápido para câmera, decals, linha de visão | Raycaster padrão (lento em malha grande) |
| Validação de dados | `zod` | Schemas tipados para todo `data/*.json`; erros legíveis | JSON Schema puro (mais verboso) |
| Áudio | **WebAudio direto** (mixer próprio pequeno) | Barramentos, ducking por sidechain manual, crossfade por compasso, síntese de camadas | Howler (sem ducking/buses de verdade) |
| UI/HUD | DOM + CSS (sem framework) | Leve, nítido em qualquer DPR, fácil de testar no Playwright | React (peso e indireção), canvas UI (texto ruim) |
| Testes | Vitest (unit) + Playwright (e2e, captura, perf) | Rápidos; Playwright usa GPU real em modo headed | Cypress (sem WebGL bom) |
| Comparação visual | `pixelmatch` + `pngjs` | Simples, determinístico | — |
| Otimização de glTF | `@gltf-transform/cli` (meshopt, dedup, prune, resize) + **KTX2** via `toktx` (KTX-Software, Apache-2.0) em `tools/bin/` | Texturas comprimidas na GPU = menos VRAM e download | WebP (menor download, mas descomprime na VRAM) — fallback se `toktx` falhar |
| Assets 3D | Blender 4.2 headless + MPFB2 2.0.17 (já instalado em perfil isolado) | Provado no Bairro com 0 intervenção; MPFB2 dá corpo, rosto, macros e esqueleto CC0 | Serviços de imagem→3D (rejeitados pelo usuário) |
| Landmarks faciais | MediaPipe Face Landmarker (`@mediapipe/tasks-vision`, Apache-2.0) rodando numa página local via Playwright | 478 pontos com profundidade relativa; evita dor de versão do pacote Python | dlib (68 pontos, sem profundidade) |
| Deploy | GitHub Actions → GitHub Pages | Repo já existe; grátis; HTTPS | Cloudflare Pages (desnecessário após decisão do usuário) |

## Restrições de plataforma assumidas
- **GitHub Pages não envia cabeçalhos customizados** → sem COOP/COEP → sem `SharedArrayBuffer`/threads WASM. Rapier e
  recast rodam single-thread na thread principal. Não usar o hack `coi-serviceworker` (frágil em iOS).
- Limites do Pages: site ≤ 1 GB, arquivo ≤ 100 MB, banda "soft" de 100 GB/mês. Meta do jogo: **≤ 150 MB no total**.
- **Sem Git LFS** para runtime (o Pages não serve LFS de forma confiável e a cota grátis é pequena). Assets de runtime
  versionados direto, pequenos e comprimidos.
- Versões das dependências **fixadas** no `package.json` (sem `^`) no momento da instalação; registrar em `DECISIONS.md`.

## Riscos desta escolha e mitigação
| Risco | Mitigação |
|---|---|
| Three.js não tem "AnimBP" | `src/engine/anim/` próprio, pequeno e testado (ver `ARCHITECTURE.md` §5) |
| Rapier ragdoll pode ficar "mole" | Limites de junta por osso em `data/physics/ragdoll_humanoid.json`, massa por segmento realista, damping angular, teste visual dedicado |
| WebGL2 sem compute | Partículas em GPU por vertex shader (instanced), sem compute; fur por shells |
| Mudanças de API do three entre versões | Versão fixada; atualizar só em milestone de manutenção |
| Main thread sobrecarregada (física + IA + anim) | Orçamentos por sistema medidos no overlay de perf; LOD de animação e IA; pool de ragdoll |
