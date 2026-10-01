# ANALYSIS — Projeto Lobo (jogo "Márcio")

Data: 2026-09-30 · Autor: Claude Opus 5.5 (sessão de arquitetura) · Status: **PROPOSTO, aguardando revisão do usuário**

Este documento cobre a **Etapa 1** (o que aprender com o projeto Unreal existente) e a **Etapa 2** (decomposição técnica
do novo jogo). As decisões derivadas estão em `TECH_STACK_DECISION.md`, `ARCHITECTURE.md` e `MASTER_BUILD_PROMPT.md`.

---

## Etapa 1 — O projeto Unreal existente (`C:\PROJETOS\Projeto_Bairro`)

### 1.1 O que é
Life sim 3D estilizado (codinome "Bairro"), Unreal 5.8, PC/Steam. Fase atual: **B — bootstrap agent-first**; ainda não
há gameplay. O valor do projeto está quase todo na **engenharia de processo** para agentes, e num spike comparativo
Unreal × Godot (SPIKE-ENG-001) que gerou evidência real sobre animação, ragdoll, retarget e automação por Blender.

Arquivos lidos: `AGENTS.md`, `CLAUDE.md`, `README.md`, `Docs/AGENT_FIRST_UNREAL.md`, `Docs/Contracts/ARCHITECTURE_CONTRACT.md`,
`Docs/Contracts/PERFORMANCE_CONTRACT.md`, `Docs/DEV_WORKFLOW_LOW_SPEC.md`, `Docs/ENGINE_EVALUATION.md` (trechos),
`AgentOps/PROTOCOL.md`, `AgentOps/ROLES.md`, `AgentOps/Templates/MANIFEST.toml`, `Research/Spike/ANIMACOES_E_TOON.md`,
`Research/Spike/RAGDOLL_E_HUMANOIDE.md`, `Spike/ENG-001/Shared/**` (humanoide MPFB2, retarget, automação Blender),
`Tools/**` (Bench, CityBuild, CityExtract), histórico Git recente.

### 1.2 Reutilizar conceitualmente (entra quase igual)
| Conceito do Bairro | Onde está | Como entra no Lobo |
|---|---|---|
| **O repositório é a memória; o chat é só interface** | `PROTOCOL.md` §1 | `docs/PROJECT_STATE.md` (ponto de retomada) + `docs/DECISIONS.md` (log de decisões) + `PENDENCIAS.md` |
| **Contexto sob demanda** — `AGENTS.md` curto, resto lido quando a task pede | `AGENTS.md` | `AGENTS.md` curto com ordem de retomada; docs específicos só quando necessários |
| **Fila assíncrona de perguntas** (`PENDENCIAS.md`) — o agente não bloqueia: registra a pergunta e segue com o padrão seguro | `PENDENCIAS.md` | Igual. Essencial para o agente trabalhar horas sem o usuário |
| **Evidência antes de afirmação** / `NOT VALIDATED` | `AGENTS.md`, `PROTOCOL.md` | Regra literal no `AGENTS.md` (`NÃO VALIDADO`) |
| **Texto é a fonte da verdade; asset gerado é reproduzível** com carimbo `Source`/`SourceHash`/`GeneratorVersion` e `--check` | `AGENT_FIRST_UNREAL.md` §4 | `data/**/*.json` + `public/assets/manifest.json` com hash da fonte; `npm run assets:check` |
| **Overrides em texto** para ajuste manual de algo gerado (não editar o gerado) | §4, CityBuild | Níveis gerados por dados + `data/levels/<andar>/overrides.json` |
| **Um comando de verificação** (`bairro verify`) com etapas em ordem, para na 1ª falha grave, `report.json` legível por máquina, `--quick` | §6 | `npm run verify` / `verify:quick` → `.agent-tmp/verify/<data>/report.json` |
| **Comparação visual por captura** com baselines aprovadas e tolerância | §6 | Playwright + pixelmatch, câmeras fixas, seed fixa (`tests/baselines/`) |
| **Smoke sem janela** (sobe o mapa, roda N s, zero erro no log) | §6 | Playwright abre `?scene=…&autotest=1`, roda cenário, falha em qualquer `console.error` |
| **Mapas DEV_* como níveis de teste** | `PERFORMANCE.md` | Cenas sandbox por URL: `?scene=sandbox-combat`, `anim-viewer`, `char-viewer`, `face-compare`, `perf-stress` |
| **Orçamentos de performance com máquina de referência** (G15 / RTX 3050 4 GB) e regra de regressão (>5% frame) | `PERFORMANCE_CONTRACT.md` | `docs/PERFORMANCE_PLAN.md` — mesma máquina, budgets Web |
| **Medir com protocolo**: tomada, GPU dedicada confirmada (não a Iris Xe), aquecimento, seed fixa, mediana de 3 | `PERFORMANCE_CONTRACT.md` | Perf script registra `WEBGL_debug_renderer_info` e falha se não for a RTX |
| **Tiers de NPC por significância** (o tier muda representação/frequência, nunca a identidade lógica) | `ARCHITECTURE_CONTRACT.md` I-01/I-13 | Inimigo/civil = registro lógico; representação (anim full / anim reduzida / corpo baked) muda por distância |
| **Ragdoll com teto** e LOD de física | contratos | Pool fixo de ragdolls por preset; corpos em 3 tiers |
| **RNG com seed por subsistema** + replay | I-08 | `Rng` por sistema; cenários de teste determinísticos |
| **Composição antes de herança; tick por frame exige justificativa; hot path sem alocação** | `ARCHITECTURE_CONTRACT.md` §C | Regras de código no `ARCHITECTURE.md` |
| **Organização por feature/domínio**, não por tipo técnico | §C | `src/game/combat/`, `src/game/ai/`… |
| **Pipeline Blender headless**: humanoide MPFB2 gerado por script (`make_humanoid.py`), esqueleto `game_engine` de 53 ossos (nomes estilo UE Mannequin), retarget CMU/Quaternius por script, correção de animação por frame + reimport, **0 intervenção humana** (T7: 13/13) | `Spike/ENG-001/Shared/**` | Base do pipeline de personagens do Lobo. MPFB2 2.0.17 **já está instalado** em perfil isolado nesta máquina (`C:\Ferramentas\Blender-spike-profile`) |
| **Licenças conferidas na fonte**: Quaternius UAL = CC0; CMU = uso comercial ok (sem revender os dados); MPFB2 assets = CC0 (código GPL, só ferramenta); Mixamo = uso em jogo ok, mas exige login e proíbe redistribuir avulso | `RESEARCH-SPIKE-0002/0003` + reviews | `CREDITS.md` + `assets-src/vendor/` fora do Git |
| **"Se o mesmo erro acontece 2 vezes, vira regra/validador/teste"** | `PROTOCOL.md` §1.7 | Literal no `AGENTS.md` |
| **Temporários só em `.agent-tmp/`** | `AGENTS.md` | Igual |
| **Fitness functions** (cada invariante vira check automático) | `ARCHITECTURE_CONTRACT.md` §A | Invariantes do Lobo com teste (ver `ARCHITECTURE.md` §10) |

### 1.3 Adaptar (a ideia é boa, a forma muda)
| Do Bairro | Por que muda | Forma no Lobo |
|---|---|---|
| Protocolo multiagente (Director, Codex, Gemini, manifestos TOML, worktrees, locks, REVIEW formal) | Aqui é **um** agente principal (Opus 5.5) trabalhando longo, com subagentes eventuais. O peso de processo do Bairro custaria mais que o ganho | Milestones com **critério de saída + evidência** em `docs/DEVELOPMENT_ROADMAP.md`; subagentes só para trabalho realmente independente (ex.: pipeline de rosto em paralelo ao combate) |
| CLI `bairro` + MCP do editor | Não há editor. O "editor" é o próprio navegador | `npm run <op>` + **API de debug no jogo** (`window.__LOBO__`) chamada pelo Playwright: spawn, teleporte, cenários, captura, perf |
| Classes de task (MICRO/STANDARD/HIGH_RISK) | Útil como régua de rigor, sem manifesto | No prompt mestre: mudanças em combate/feel, esqueleto, pipeline de rosto e performance exigem evidência visual + perf antes/depois |
| Perfis DEV-LITE / VISUAL-HIGH | Web já é leve para iterar | Presets de jogador Low/Medium/High/Ultra + `?quality=` forçado em teste; DEV usa High |
| Budgets de Unreal (GT/RT ms, VRAM 3,2 GB) | Browser tem overhead, WebGL tem custo por draw call muito maior | Budgets Web: draw calls ≤ 400 (desktop), memória de textura ≤ 700 MB, JS heap ≤ 350 MB (ver `PERFORMANCE_PLAN.md`) |
| Physics Control / active ragdoll (Unreal) | Não existe na Web | Rapier: ragdoll de ~11 corpos com juntas limitadas + **blend animação→física** com velocidade herdada da animação + impulso do golpe; "powered ragdoll" leve só no stagger (opcional) |
| Animation Budget Allocator / Significance Manager | Não existe na Web | `AnimLodSystem` próprio: taxa de update do mixer por distância/visibilidade |
| Teste de equilíbrio/get-up do spike | Escopo diferente (life sim) | Get-up só para knockdown de inimigos (2 clips: de bruços e de costas, CMU/Quaternius/Mixamo) |

### 1.4 Descartar (específico da Unreal)
Blueprint e orçamento de nós; `.uasset`/`.umap`, LFS para binário de editor, One File Per Actor; UBT/UAT/commandlets;
trabalhador `UnrealEditor -RenderOffScreen`; plugin MCP oficial e suas regras de segurança; Lumen/Nanite/VSM/TSR;
Game Animation Sample, Motion Matching, Mover, Mass Entity, StateTree; módulos C++ (`BairroCore`…); caminho ≤ 260 chars;
"uma Unreal/UBT por vez" (vira "um Blender por vez"); toda a infraestrutura de cidade (CityExtract/CityBuild/Sakuragaoka)
— ela é de outro jogo, só o **padrão** (dados → gerador → overrides → check) é reaproveitado.

### 1.5 Redesenhar para a Web (não existe equivalente direto)
- **Entrega e carregamento:** download progressivo, cache HTTP, KTX2/Basis + Meshopt, streaming por andar (o Bairro
  nunca precisou pensar em "o jogador baixa o jogo a cada visita").
- **Mobile:** toque, orientação, fullscreen, DPR, thermal throttling, áudio que só liberta após gesto do usuário.
- **Custo por draw call:** em WebGL o gargalo típico é CPU/driver por draw call, não triângulos. Merge, atlas e
  instancing são obrigatórios desde o início.
- **Sem threads garantidas:** GitHub Pages não envia cabeçalhos COOP/COEP → sem `SharedArrayBuffer`. Física e IA rodam na
  thread principal com orçamento; workers só para decodificação (KTX2/Draco/Meshopt) e tarefas sem memória compartilhada.
- **Senha no site estático:** porta de entrada no cliente (hash), sem servidor.
- **Validação visual por navegador real:** Playwright com GPU real (headed/ANGLE D3D11), não SwiftShader.

### 1.6 Lições do spike que valem ouro aqui
1. **O agente consegue fazer Blender sozinho** (gerar humanoide, retargetar, corrigir animação e reimportar) com 0
   intervenção — desde que tudo seja script e haja relatório JSON de cada etapa.
2. **Erros silenciosos matam tempo** (ex.: bake de navmesh ignorado, escala de FBX, massa aplicada duas vezes). Toda etapa
   de pipeline precisa validar a própria saída (contagem de ossos, escala, altura, nº de clipes, duração).
3. **Joelho dobrando para frente** no ragdoll gerado: limites de junta precisam de valores revisados por osso, não
   automáticos.
4. **GPU errada** (Iris Xe em vez da RTX) invalida medição. O script de perf precisa checar o renderer.
5. **Ciclo rápido > ferramenta poderosa.** A Godot custou menos tentativas que a Unreal por iterar mais rápido. Na Web
   com Vite o ciclo é de segundos — é a maior vantagem que temos.

---

## Etapa 2 — Decomposição técnica do novo jogo

### 2.1 Sistemas e dependências
```
                        ┌──────────── Conteúdo em dados (data/*.json, validado) ────────────┐
                        ▼                                                                    ▼
 Input ─► Player/Márcio ─► Combate (golpes, hitbox, hitstop, finalizações) ─► Dano/Saúde ─► Morte/Ragdoll/Corpos
   │            │                 ▲            │                                 │
   │            ▼                 │            ▼                                 ▼
   │       Animação (FSM, blend,  │       Barra do Lobisomem ─► Transformação ─► Moveset Lobisomem (devorar, desmembrar)
   │       camadas, eventos, IK)  │
   │            ▲                 │
   ▼            │                 │
 Câmera ◄── Alvo/Lock suave ◄── IA inimiga (tokens de ataque, slots, arquétipos) ◄── Navegação (navmesh + crowd)
                                  │
                       Civis/Reféns (medo/esperança)          Armas improvisadas (durabilidade, som)
                                  │                                   │
 Níveis (andares, salas, arenas, barricadas) ─► Encontros/Waves ─► Progressão (boss libera andar) ─► Save/Checkpoint
                                  │
 Destruição (materiais, integridade, debris)   Áudio (mixer, ducking, música dinâmica)   VFX/Pós   UI/HUD   Mobile
```
Dependências críticas: **animação** e **personagem** bloqueiam a percepção de qualidade de tudo; **combate** depende de
animação + câmera + hitstop + som; **lobisomem** depende de combate + pipeline de personagem (mesma malha com morph
targets); **ambiente** depende do gerador de níveis + bake de luz; **bosses** dependem de tudo acima.

### 2.2 Gargalos reais (em ordem de perigo)
1. **Assets de animação** — código não substitui movimento bom. Fontes automáticas (CC0) cobrem locomoção, alguns socos,
   reações e mortes; **variedade de golpes brutais** precisa do Mixamo (usuário baixa) ou de animação autorada por
   script/procedural. Corrida quadrúpede do lobisomem **não existe** em bibliotecas livres → autoria procedural.
2. **Fidelidade facial com uma foto frontal** — o perfil lateral é inferido. Dá para ficar "claramente o Márcio" de frente
   e 3/4; de perfil fica plausível, não exato.
3. **Draw calls com muitos personagens** — cada inimigo modular pode virar 6–8 draw calls; precisa merge em runtime.
4. **Física de ragdoll na thread principal** — orçamento rígido e pool.
5. **Música metal sem gravação própria** — fontes livres são genéricas; a camada dinâmica depende de faixas compatíveis.
6. **Mobile** — iPhone não permite travar orientação nem fullscreen de elemento; GPU móvel limita pós-processo.

### 2.3 Dificuldade real (estimativa honesta)
| Sistema | Dificuldade para o agente | Comentário |
|---|---|---|
| Loop, input, câmera 3ª pessoa, presets | Baixa | Domínio forte |
| Combate com feel (frame data, buffer, hitstop, warp até o alvo, shake) | Média | Código é fácil; **feel** exige muitas iterações com captura e bot |
| FSM de animação com blend/camadas/eventos/IK de pé | Média | Three.js não tem "AnimBP": construir camada própria pequena |
| IA com tokens/slots + navmesh/crowd | Média | Padrão conhecido; recast-navigation-js resolve navegação |
| Ragdoll Rapier convincente (massa, limites, blend) | Média-alta | Tuning de juntas e massa; spike mostrou armadilhas |
| Corpos persistentes em tiers + bake de pose | Média | CPU skinning único por corpo + merge |
| Desmembramento | Média-alta | Peças pré-separadas no Blender + escala de osso + tampa |
| Pipeline de personagem MPFB2 + roupas + variação | Média | Já provado no spike (base); roupas/atlas são novidade |
| **Rosto estilo WWE 2K (landmarks → fit → projeção → blend)** | **Alta** | Maior risco técnico-artístico; tem métrica automática (erro de landmark, SSIM) |
| Transformação em lobisomem (morph + fur shells + rasgo de roupa + FX) | Alta | Visualmente crítica; dá para fazer bem com morph targets na mesma malha |
| Corrida quadrúpede | Alta | Autoria procedural (IK + ciclo) |
| Níveis convincentes (gerador + bake de luz Cycles) | Média-alta | Bake headless é automatizável; arquitetura "crível" exige plano de planta bom |
| Bosses com fases e cinemáticas | Média | Depois que o resto existe, é conteúdo + script |
| Áudio dinâmico + ducking | Baixa-média | WebAudio domina; o problema é a fonte das faixas |
| Mobile (toque, orientação, HUD) | Média | Limitações de iOS documentadas com fallback |

### 2.4 Requisitos críticos (não negociáveis)
1. Combate responsivo: input → primeira frame de reação ≤ 1 frame lógico (16,7 ms), buffer de 150–200 ms, cancel windows.
2. Márcio reconhecível de frente e em 3/4 em close-up (transformação e finalizações dão close).
3. Zero T-pose, zero pé deslizando visivelmente na locomoção básica, zero transição "estalo" nas transições principais.
4. 60 FPS no G15 (High, 1080p) em combate com 8+ inimigos; ≥ 30 FPS estáveis em celular intermediário (Medium).
5. Corpos nunca somem na frente do jogador.
6. Áudio da transformação (`FALA LOBINHO`, 1,25 s) abafa a música (ducking forte) e sincroniza com o close frontal.
7. Senha (definida em `.env.local`) antes de baixar os assets pesados.
8. Jogo completo jogável do início ao fim (3 andares, 3 bosses — 2 e 3 como placeholder configurável até definição).

### 2.5 O que é ilusão (e o que fazemos em vez disso)
| Pedido | Limite real | Solução |
|---|---|---|
| "Tela deita sozinha" | Android Chrome: sim, só após gesto e em fullscreen (`screen.orientation.lock`). iPhone Safari: **não existe** API | Android: botão "JOGAR" → fullscreen + lock landscape. iOS: overlay animado "gire o celular" + layout que funciona em landscape; PWA instalável como bônus |
| Senha protegendo o jogo | Site estático + repo público: a senha só barra visitante casual | Hash SHA-256 no cliente, assets pesados só carregam depois; fotos originais fora do repo (decisão do usuário) |
| Física de 40 cadáveres | Inviável | Tiers: ragdoll → pose congelada → malha estática baked e mesclada |
| Ragdoll estilo Euphoria | Inviável na Web com qualidade | Animação de reação + ragdoll com velocidade herdada + limites de junta corretos = peso convincente |
| Rosto perfeito de perfil a partir de 1 foto frontal | Informação inexistente | Perfil inferido pela profundidade do MediaPipe + base MPFB2; aceitar "plausível" de perfil |
