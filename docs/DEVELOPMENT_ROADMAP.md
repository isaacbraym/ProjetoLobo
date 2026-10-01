# DEVELOPMENT_ROADMAP — Projeto Lobo

Data: 2026-09-30 · Status: **PROPOSTO**
Cada milestone termina com algo **jogável e testável**, com **critério de saída** e **evidência** (capturas em
`.agent-tmp/evidence/Mx/` + resumo em `docs/PROJECT_STATE.md`). Não pular para o próximo sem o critério de saída
(exceção: trabalho paralelo explicitamente independente, como o pipeline de rosto).

Estimativa honesta: M0–M2 cabem numa sessão longa "ultracode" bem conduzida. O jogo completo (M0–M10) exige **várias
sessões longas**. O valor está em cada milestone deixar o jogo melhor e estável, não em correr para o fim.

---

## M0 — Fundação e harness
**Entrega:** projeto Vite+TS+three rodando; gate de senha (hash gerado de `.env.local`); loader com progresso; loop de passo fixo;
input abstrato (teclado/mouse/gamepad/toque básico); presets de qualidade com detecção; overlay de perf; `window.__LOBO__`
(spawn, teleporte, timescale, cenário, captura, perf, estado); cenas sandbox por URL; schemas zod + `validate:data`;
`npm run verify` completo (typecheck → validate:data → unit → build → assets:check → e2e smoke → capturas → comparação
visual) gerando `report.json`; runner do Blender headless com relatório; download das ferramentas (`toktx`) para
`tools/bin/`; GitHub Actions de build/deploy preparado (sem push sem autorização).
**Saída:** `verify` PASS; captura de uma sala de teste **bem iluminada** (não cinza: piso com material, luz quente/fria,
pós) a 60 FPS no DESKTOP_REF; e2e confirma que nenhum asset pesado carrega antes da senha.

## M1 — Personagem e movimento
**Entrega:** pipeline MPFB2 → esqueleto único → GLB otimizado; **Márcio v1** (corpo por silhueta, roupas por casca com
textura projetada, barba e cabelo v1, rosto ainda genérico-aproximado); animações CC0 retargetadas e polidas (Quaternius
UAL + CMU) com `anim_polish`; `AnimGraph` (locomoção com blend, transições, eventos de passo); controlador com Rapier
character controller; câmera 3ª pessoa completa (colisão, suavização, look-ahead); `?scene=anim-viewer` e
`?scene=char-viewer`; sons de passo.
**Saída:** Márcio anda/corre/para numa sala bonita sem pé deslizando visível, sem T-pose, transições suaves; capturas de
4 ângulos + contact sheet das animações; 60 FPS.

## M2 — Vertical Slice de combate (O MAIS IMPORTANTE)
**Entrega:** golpes leves (cadeia de 4 com variantes), pesado (+ carregado), chute, esquiva + esquiva perfeita/contra,
free-flow com warp, hitstop, shake por trauma, hit reactions (aditivo + stagger + knockdown + levantar), **3 thugs**
modulares v1 com IA + CombatDirector (tokens/slots/telegrafia), ragdoll de morte com velocidade herdada, sangue
(partícula + decal), corpos T1→T2→T3, SFX de impacto em camadas, música de combate simples, HUD mínimo, controles de
toque básicos, **bot de teste** que luta sozinho.
**Saída (checklist de feel, revisado por capturas em sequência e GIF/frames):** input → reação ≤ 1 frame lógico;
nenhum golpe "no vazio" quando há alvo no cone; 3 inimigos nunca atacam juntos no Normal (teste L-05); corpos caem com
peso (sem quicar, sem joelho invertido); o bot vence o cenário em < 60 s sem erros; 60 FPS. **Se o combate não estiver
gostoso aqui, não avance — iterar M2 é o melhor uso de tempo do projeto inteiro.**

## M3 — Rosto do Márcio (técnica WWE 2K) — pode rodar em paralelo ao M2
**Entrega:** pipeline F1–F11 (`ASSET_PIPELINE.md` §3) automatizado; `face_report.json` + `face_compare.png`; Márcio v2
com rosto ajustado, olhos, sobrancelhas, barba com volume, cabelo penteado; morphs de expressão; cena `face-compare`.
**Saída:** erro de landmark ≤ 3% interocular, SSIM ≥ 0,80, e inspeção visual das 5 vistas aprovada pelo agente com
justificativa; capturas em jogo (close de frente, 3/4, perfil) com a iluminação do jogo.

## M4 — Combat Slice 2: variedade
**Entrega:** arquétipos fast, heavy, grappler, armed, thrower, shield, elite; gerador de variação (morphs de rosto/corpo,
roupas, cabelos, acessórios, tint, tatuagens) com mesclagem em runtime; agarrão + arremesso (parede/mesa/inimigos);
**finalizações** (≥ 6) com câmera; armas improvisadas (6 + pesadas de uso único) com durabilidade, estado danificado,
quebra e som próprio; props destrutíveis com materiais/integridade/fratura; desmembramento humano limitado (facão).
**Saída:** cena `sandbox-arena` com 10 inimigos variados: nenhum par visualmente idêntico em captura; draw calls dentro
do orçamento; cada arma com som distinto (verificação por lista); mesa leva 3–5 golpes do humano.

## M5 — Werewolf Slice
**Entrega:** barra (regras da `GAME_DESIGN.md` §5); transformação de ~2 s com close frontal, `wolfAmount` dirigindo
morphs/pelo/garras/orelhas/rasgo/olhos, **"FALA LOBINHO" com ducking forte**, rugido + onda de choque; moveset do lobo;
devorar (cura); desmembramento; destruição ampliada; **corrida de quatro** (galope autorado + FOV + blur radial leve +
poeira); timer e retorno; camada musical do lobo.
**Saída:** sequência de capturas da transformação (8 frames) mostrando Márcio reconhecível do início ao fim;
áudio: música medida ≥ 15 dB abaixo durante a fala (análise do bus no teste); lobo destrói mesa em 1 golpe; 60 FPS com
pelo no High.

## M6 — Environment Slice: Andar 1 completo
**Entrega:** planta do andar 1 em dados; gerador Blender; materiais CC0; **lightmap baked** + probes; zonas/portais;
navmesh; encontros e **arenas com barricadas variadas** (portas de vidro, grades, mesas empilhadas, porta de segurança);
reféns com estados (cativo/esperança/fuga/pânico); TVs procedurais; segredos; checkpoints; música dinâmica completa
(explore/combat/arena + lobo); civis modulares.
**Saída:** percurso automático do bot pelo andar inteiro sem softlock; capturas de todas as salas; sensação de "prédio
real" (revisão visual: escala, luz, mobília coerente); performance dentro do orçamento.

## M7 — Boss 1: Clóvis B.
**Entrega:** rosto do Clóvis (pipeline F1–F11 com boca aberta), corpo/roupa/bengala; perna-cobra procedural; 3 fases;
intro cinematográfica; arena do auditório; finalizações especiais; música de boss; desbloqueio do elevador.
**Saída:** luta completa vencível pelo bot em modo de teste e por humano no Normal; capturas do intro e de cada fase;
`face_compare` do Clóvis aprovado.

## M8 — Mobile e escalabilidade
**Entrega:** controles de toque finais (layout configurável, opacidade, tamanho), fluxo de fullscreen + lock landscape
(Android) e overlay de rotação (iOS), HUD adaptado a telas pequenas e notch (`env(safe-area-inset-*)`), presets
Low/Medium ajustados, resolução dinâmica, áudio liberado no gesto, PWA (manifest + ícones).
**Saída:** capturas Playwright em emulação (iPhone landscape/portrait, Android) sem sobreposição de HUD; checklist para o
usuário testar no celular real (`PENDENCIAS.md`) com overlay de perf.

## M9 — Andares 2 e 3, fluxo completo
**Entrega:** plantas, geração e bake dos andares 2 e 3; encontros; bosses placeholder data-driven (substituíveis);
cena do elevador com pré-carga; vidas/game over/checkpoints; menus completos; final + créditos; skin Márcio Herói
desbloqueável (com capa física).
**Saída:** jogo zerável do início ao fim pelo bot (modo teste) sem erros; save/continuar funcionando.

## M10 — Polimento e lançamento
**Entrega:** passe de feel (hitstop, sons, câmera), passe de animação (substituir as piores pelas do Mixamo se o usuário
tiver baixado), passe de iluminação, passe de performance (baselines finais), créditos/licenças, deploy no GitHub Pages
(com autorização), README para os amigos.
**Saída:** `verify` PASS, perf dentro do orçamento, checklist de qualidade (`MASTER_BUILD_PROMPT.md` §Qualidade) completo.

---

## Dependências entre milestones
```
M0 ─► M1 ─► M2 ─► M4 ─► M5 ─► M6 ─► M7 ─► M8 ─► M9 ─► M10
            └─► M3 (paralelo ao M2; obrigatório antes do M5)
```
M8 (mobile) tem itens desde M0 (input abstrato, presets, toque básico em M2) — o M8 é o passe de acabamento.
