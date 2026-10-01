# PROJECT_STATE — ponto de retomada

Atualizado: 2026-10-01 · Por: sessão 1 (Claude Opus 5.5, "ultracode")

## RETOMAR AQUI
**Estado:** M0 ✔ · M1 v1 ✔ (Márcio gerado no Blender) · M2 em andamento (combate jogável, inimigos reais) ·
M3 v1 ✔ (rosto por projeção da foto) · M5 v1 ✔ (transformação em lobisomem jogável, sem morph targets ainda).
Jogo publicado: https://isaacbraym.github.io/ProjetoLobo/ (deploy automático a cada push em `main`).
Local: preview "lobo-dev" (`.claude/launch.json`) → http://localhost:5180/ProjetoLobo/ ·
sem menu e com bot: `?autotest=1&bot=1&perf=1`.

### O que já funciona
- **Gate de senha** (hash gerado de `.env.local`), carregamento, menu (dificuldade, qualidade, controles), HUD.
- **Saguão de teste** "Edifício Vértice" procedural: mármore escuro com reflexo, painéis de madeira, colunas, recepção
  com logo, catracas com LED, mezanino, TVs com telejornal procedural, fachada de vidro com cidade noturna.
- **Márcio** gerado no Blender (`data/characters/marcio.json`): corpo MPFB2 com barriga/braços/ombros, polo verde com
  malha piquê, jeans com sarja, tênis, cabelo penteado para trás, barba. **Rosto v1 = foto projetada** (técnica
  WWE 2K-lite): 5 pontos-chave da foto alinhados aos da cabeça 3D (erro < 2 px), UV `FaceProj` + máscara por vértice,
  pele do corpo com o tom das bochechas da foto. Foto recortada em `public/assets/characters/marcio_face.jpg`.
- **Inimigos reais** (mesmo pipeline): `thug_a` (camiseta), `thug_slim` (moletom manga longa), `thug_heavy` (careca,
  regata, barba). Cor de roupa sorteada por instância (`palette` em `data/enemies/archetypes.json`).
- **Combate:** cadeia de 4 leves com variantes (jab, cruzado, gancho, uppercut), pesado, chute, free-flow com warp,
  hitstop, sangue persistente, som sintetizado, esquiva + esquiva perfeita (câmera lenta), cancelamentos.
  Golpes autorados por pose-chave em `data/anim/authored.json` (`src/engine/anim/poseAuthoring.ts`).
- **IA:** CombatDirector (fichas + anéis), telegrafia (indicador vermelho), stagger por poise, super-armor do Heavy.
- **Morte:** ragdoll Rapier (11 corpos) → congela ao repousar (T2), sem sombra; poça de sangue.
- **Lobisomem v1** (`src/game/werewolf/`, `data/werewolf.json`): barra por eventos → R (gamepad LT+RT, botão LOBO no
  toque) → close frontal no rosto, **"FALA LOBINHO"** (`public/assets/audio/transform_fala_lobinho.mp3`) com ducking
  de −18 dB + passa-baixa na música, mundo a 0,25×, braços/mãos/peito crescem (escala de osso), pelo em 10 cascas,
  garras, orelhas, olhos âmbar, postura curvada, rugido sintetizado + onda de choque; dano ×2,5, velocidade ×1,4,
  dano recebido ×0,5, timer 25 s (+1,5 s por kill) e retorno.
- **Harness:** `npm run verify` (PASS), `npm run capture [combat|wolf|face|menu]`, `window.__LOBO__`
  (`state()`, `spawn()`, `bot(true)`, `transform()`, `faceCam(true, dist, ângulo)`, `perf()`…), overlay `?perf=1`.

### Próximo passo (em ordem)
1. **Rosto v2:** os 5 pontos da foto foram marcados à mão em `data/characters/marcio.json` (`face.landmarks`).
   Automatizar com MediaPipe (ver `docs/ASSET_PIPELINE.md` §3) e ajustar a forma da cabeça (modificadores MPFB de
   nariz/olhos/boca/mandíbula). Olhos: a malha do olho aparece por cima da foto (contorno escuro) — avaliar esconder a
   esclera da malha ou recolorir com a foto. Cabelo ainda é uma calota; melhorar volume/linha do cabelo.
2. **Lobisomem v2:** morph targets reais na malha do Márcio (Blender: `wolf_body`, `wolf_face`), roupa rasgando
   (dissolve), corrida de quatro (galope autorado), devorar, desmembramento. Pelo hoje é shells simples.
3. **Combate restante (M2/M4):** knockdown + levantar (clipes CMU get-up já existem no cache do Bairro — ver
   `docs/ASSET_PIPELINE.md` §0), finalizações com câmera, agarrão/arremesso, armas improvisadas, mais arquétipos
   (grappler, armed, thrower, shield, elite), props destrutíveis.
4. **Música:** o usuário vai entregar faixas de IA (PENDENCIAS P04) — `audio.musicBus` + ducking já prontos.
5. **M6:** andar 1 de verdade (gerador de planta + bake de luz no Blender), reféns, arenas com barricadas.
6. Bosses (Clóvis), mobile real, presets, andares 2/3.

### Como gerar personagens (Blender headless, ~1–2 min cada)
```
BLENDER_USER_RESOURCES=C:/Ferramentas/Blender-spike-profile "C:/Program Files/Blender Foundation/Blender 4.2/blender.exe" -b --python tools/blender/build_character.py -- --recipe data/characters/marcio.json --anims
```
(`--anims` regrava `public/assets/anims/humanoid_anims.glb`; só precisa no Márcio.) Renders de conferência em
`.agent-tmp/characters/<id>/{front,side,face,pose}.png`. Receitas: `data/characters/*.json`.

### Arquitetura de personagens (importante)
- Esqueleto de runtime = esqueleto UE do Quaternius UAL (65 ossos). O builder move só as juntas para o corpo MPFB2
  (rotações de repouso preservadas, DEC-0009) → todos os personagens usam os mesmos clipes.
- Pelve: os clipes vêm com a pelve do Márcio; `AnimLibrary.derivedFor()` corrige para cada esqueleto (altura).
- Materiais vêm por NOME do Blender e são trocados no runtime (`src/engine/render/materialLibrary.ts`).

### NÃO VALIDADO
- Performance na RTX 3050 (Playwright e painel embutido usam a Iris Xe: ~48–60 FPS no Medium com 3–5 inimigos).
- Celular real, gamepad físico.
- Timing exato da transformação nas capturas (as capturas travam o rAF; no jogo real é contínuo).

### Dívidas conhecidas
- Ragdoll sem limites de junta (esta versão do Rapier não expõe motor em junta esférica; usa amortecimento).
- Corpos T3 (malha baked mesclada) não implementados; corpos ficam em T2.
- Navmesh não usada ainda (sandbox aberto).
- `validate:data` ainda não valida `werewolf.json` nem `data/characters/*.json`.
- Personagens têm ~14 peças (draw calls); mesclar em runtime quando houver muitos inimigos.
