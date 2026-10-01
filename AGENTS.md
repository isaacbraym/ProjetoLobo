# AGENTS.md — Projeto Lobo (jogo "Márcio")

Regras para qualquer agente que trabalhe aqui. Prioridade sobre `C:\PROJETOS\AGENTS.md`.
Curto de propósito: o resto é lido **sob demanda**.

## Retomar o trabalho (sempre nesta ordem)
1. `docs/PROJECT_STATE.md` — onde paramos, milestone atual, próximo passo.
2. `PENDENCIAS.md` — perguntas abertas ao usuário (não bloqueie: assuma o padrão seguro registrado lá).
3. `docs/MASTER_BUILD_PROMPT.md` — o contrato de construção (prioridades, milestones, regras).
4. Só então o doc específico da tarefa (`docs/ARCHITECTURE.md`, `docs/ASSET_PIPELINE.md`, `docs/GAME_DESIGN.md`…).

## Regras que valem sempre
- **Stack fixada** (`docs/TECH_STACK_DECISION.md`): TypeScript + Vite + Three.js (WebGL2) + Rapier + recast-navigation.
  Trocar stack ou adicionar dependência de runtime = registrar em `docs/DECISIONS.md` com motivo.
- **Dados em texto são a fonte da verdade.** Inimigos, golpes, armas, objetos, bosses, encontros, dificuldade e presets
  vivem em `data/**/*.json`, validados por schema. Não codifique inimigo por inimigo.
- **Assets gerados são reproduzíveis.** Nunca edite à mão um arquivo em `public/assets/` gerado por pipeline: mude a fonte
  (`assets-src/`, `data/`, `tools/blender/`) e rode o gerador. Todo asset gerado tem entrada no manifesto com hash da fonte.
- **`npm run verify` é o portão.** Nada é "pronto" sem `verify` PASS **e** inspeção visual das capturas.
- Não validou? Escreva `NÃO VALIDADO`. Nunca "deve estar funcionando".
- **Um Blender por vez**, sempre headless (`--background`). 16 GB de RAM.
- Temporários (logs, capturas, scripts descartáveis): só em `.agent-tmp/`. Nada solto na raiz.
- `refs/` tem fotos de pessoas reais e áudio original: **nunca** versionar (já está no `.gitignore`). Só derivados
  processados (texturas do jogo) entram em `public/assets/`. **Exceção autorizada pelo usuário (DEC-0015):** a foto do
  rosto do Márcio fica versionada SEM extensão em `assets-src/characters/marcio_face_src` (PNG) e a textura de jogo do
  rosto também vai sem extensão (ex.: `public/assets/characters/marcio_f`). Prioridade: rosto idêntico.
- **Senha do gate:** em texto só em `.env.local` (fora do Git). Nunca escreva a senha em doc, código, commit ou bundle;
  o código guarda só sal + hash (`npm run gate:hash`).
- Licenças: todo asset externo com origem e licença em `CREDITS.md`. Só CC0/CC-BY/royalty-free com uso em jogo permitido.
  Arquivos brutos de terceiros (Mixamo, Sonniss, etc.) ficam em `assets-src/vendor/` (ignorado pelo Git).
- **Push/deploy só com autorização explícita do usuário** (ver `docs/MASTER_BUILD_PROMPT.md` §Deploy).
- Se o mesmo erro acontecer 2 vezes, vira regra, validador ou teste.
- Português do Brasil em docs, UI e comunicação.

## Mapa
| Onde | O quê |
|---|---|
| `docs/` | Análise, arquitetura, stack, pipeline de assets, performance, roadmap, riscos, prompt mestre, estado, decisões |
| `docs/ORIGINAL_BRIEF.md` | Pedido original do usuário, literal. Em dúvida de intenção, é a referência |
| `data/` | Definições JSON (fonte da verdade do conteúdo) |
| `src/` | Código do jogo |
| `tools/blender/` | Scripts Python headless (personagens, rosto, níveis, bake, LOD, retarget) |
| `tools/pipeline/` | Scripts Node (otimização glTF, KTX2, orçamento de assets, manifesto) |
| `tools/verify/` | Harness: verify, capturas, cenários automáticos, perf |
| `assets-src/` | Fontes de assets (vendor/ é local e ignorado) |
| `public/assets/` | Assets de runtime gerados (versionados, pequenos) |
| `tests/` | unit (Vitest), e2e (Playwright), baselines visuais |
| `refs/` | Referências do usuário (local, nunca versionado) |
| `PENDENCIAS.md` | Fila de perguntas ao usuário |
