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
- **Finalizações** (`src/game/combat/finishers.ts`): inimigo atordoado/com < 30% de vida perto → "E — FINALIZAR"
  (gamepad RB, toque PEGAR) → câmera lateral, câmera lenta, congelamento no impacto, explosão de sangue, ragdoll
  lançado. Variantes: uppercut fatal, martelada, chute voador (sem repetir a última). +12 na barra do lobo.
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
> **Sessão 2:** o jogo é EXPLORAÇÃO do prédio, não ondas (DEC-0017). Seguir `docs/PROMPT_SESSAO_2.md` (rosto v2 com a foto real `refs/marcio/marcio_face_real.png`,
> cinemática de abertura, câmera profissional, cinemática de golpes/críticos, animações, otimização + visual).

1. **Rosto v2:** os 5 pontos da foto foram marcados à mão em `data/characters/marcio.json` (`face.landmarks`).
   Automatizar com MediaPipe (ver `docs/ASSET_PIPELINE.md` §3) e ajustar a forma da cabeça (modificadores MPFB de
   nariz/olhos/boca/mandíbula). Olhos já usam a foto projetada (feito). **Cabelo ainda é uma calota preta** —
   melhorar volume, fios e o grisalho das laterais da referência (projetar a foto no cabelo também é uma opção).
2. **Lobisomem v2:** morph targets reais na malha do Márcio (Blender: `wolf_body`, `wolf_face`), roupa rasgando
   (dissolve), corrida de quatro (galope autorado), devorar, desmembramento. Pelo hoje é shells simples.
3. **Combate restante (M2/M4):** (knockdown/levantar e finalizações já existem) agarrão/arremesso (`mx_goalie_throw`),
   armas improvisadas (clipes `mx_standing_melee_*`, `mx_stabbing`, `mx_great_sword_*` prontos), mais arquétipos
   (grappler, armed, thrower, shield, elite), props destrutíveis. **Investigar:** numa captura um corpo pareceu ficar
   em pé após a morte (talvez morte durante `getup`/hold) — reproduzir com `npm run capture` e corrigir.
   Download inicial subiu para ~31 MB (animações 14 MB): dividir em GLB de combate + GLB extra carregado depois.
4. **Música:** o usuário vai entregar faixas de IA (PENDENCIAS P04) — `audio.musicBus` + ducking já prontos.
5. **M6:** andar 1 de verdade (gerador de planta + bake de luz no Blender), reféns, arenas com barricadas.
6. Bosses (Clóvis), mobile real, presets, andares 2/3.

### Animações Mixamo (integradas — 242 clipes convertidos; validar detalhes por captura)
- O usuário subiu **~240 FBX do Mixamo** em `assets-src/vendor/mixamo/` (fora do Git; alguns vieram "With Skin" — a
  malha é descartada automaticamente; nomes "Boxing (3)" viram `mx_boxing_3`; a T-pose de referência é ignorada).
- Retarget: `tools/blender/retarget_mixamo.py`, chamado pelo build do Márcio com `--mixamo` (mesma sessão = mesmo
  repouso). Método: delta de rotação de mundo por osso (os dois em pose T) + pelve escalada. Loops ficam no lugar e a
  **velocidade real medida** vai para `public/assets/anims/mixamo_meta.json` junto com: duração, sugestão de impacto
  (`hit`: tempo de maior alcance de cada mão/pé), `endsLying`, erro de loop. Folhas de conferência:
  `--qa "mx_a|mx_b"` → `.agent-tmp/characters/marcio/clips/`.
- Runtime: `data/anim/clipmap.json` (nome canônico → clipes em ordem de preferência; Mixamo primeiro),
  `AnimLibrary` usa o metadado para sincronizar a cadência dos pés; `Animator` reescrito (strafe lateral, troca de
  conjunto de locomoção com crossfade em fase — humano ↔ lobo, soma de pesos sempre ≥ 1).
- Golpes refeitos com clipes Mixamo em `data/combat/attacks.json` (jab/cruzado do mesmo clipe emendados, gancho,
  joelhada, cotovelada, chute MMA/giratório, voadora após esquiva, patadas Mutant como lobo, socos dos capangas com
  preparação = telegrafia). Inimigos: knockdown real (cai, fica no chão, levanta com `mx_getting_up` 2,2–6,6 s).
- Rolamento ajustado (start 0.45 / end 1.75 / speed 2.1). GLB de animações comprimido com Meshopt
  (`npx tsx tools/pipeline/optimize-anims.ts` — **rodar depois de todo build com `--mixamo`**): 24,8 → 14,2 MB.
- **Pendente validar por captura:** tempos de impacto finos de cada golpe, knockdown→getup (de bruços?), headbutt e
  brutal assassination (finalizações candidatas), clipes de reféns (hostage/kneeling/praying) para o M6.
- Rodar tudo:
  `BLENDER_USER_RESOURCES=C:/Ferramentas/Blender-spike-profile "C:/Program Files/Blender Foundation/Blender 4.2/blender.exe" -b --python tools/blender/build_character.py -- --recipe data/characters/marcio.json --anims --mixamo`
  (o export do glTF com ~285 ações demora vários minutos).

### Como gerar personagens (Blender headless, ~1–2 min cada)
```
BLENDER_USER_RESOURCES=C:/Ferramentas/Blender-spike-profile "C:/Program Files/Blender Foundation/Blender 4.2/blender.exe" -b --python tools/blender/build_character.py -- --recipe data/characters/marcio.json --anims --mixamo
```
(`--anims` regrava `public/assets/anims/humanoid_anims.glb`; só precisa no Márcio. **Sempre com `--mixamo`**, senão
o GLB de animações perde os clipes do Mixamo.) Renders de conferência em
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
