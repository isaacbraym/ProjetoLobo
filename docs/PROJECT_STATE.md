# PROJECT_STATE — ponto de retomada

Atualizado: 2026-10-01 · Por: sessão 1 (Claude Opus 5.5, "ultracode")

## RETOMAR AQUI
**Milestone atual:** M0 concluído · **M1 v1 concluído** (Márcio gerado no Blender, no jogo) · **M2 em andamento**
(inimigos ainda são manequins Quaternius — substituir pelo pipeline de personagens é o próximo passo).

### O que já funciona (jogável em `npm run dev` → http://localhost:5180/ProjetoLobo/)
- Gate de senha (hash de `.env.local`), carregamento, menu (dificuldade, qualidade, controles), HUD.
- Saguão de teste "Edifício Vértice" procedural: piso de mármore escuro com reflexo, painéis de madeira, colunas,
  recepção com logo, catracas com LED, mezanino, TVs com telejornal procedural, fachada de vidro com cidade noturna.
- Márcio (manequim verde provisório) com locomoção misturada por velocidade (idle/andar/correr/sprint), câmera 3ª pessoa
  com colisão, enquadramento de grupo e tremor por trauma.
- Combate: cadeia de 4 leves com variantes (jab, cruzado, gancho, uppercut), pesado (slam), chute, free-flow com
  warp até o alvo, hitstop local, flash de acerto, sangue (partículas + manchas persistentes no chão), som sintetizado,
  esquiva (rolamento) + esquiva perfeita (câmera lenta), cancelamentos por janela.
- Golpes que não existem na biblioteca CC0 são **autorados por pose-chave** em `data/anim/authored.json`
  (`src/engine/anim/poseAuthoring.ts`): gancho, uppercut, chute.
- Inimigos (thug, fast, heavy) por dados, IA com estados, **CombatDirector** (fichas + anéis), telegrafia com indicador
  vermelho sobre a cabeça, reações, stagger por poise, super-armor do Heavy.
- Morte → **ragdoll Rapier** (11 corpos, massa por segmento) → congela ao repousar (tier T2); poça de sangue.
- Ondas infinitas no sandbox, morte/vidas/respawn do Márcio, barra do lobo enchendo por eventos (sem transformação ainda).
- Harness: `npm run verify` (typecheck, dados, imports, unit, build+tamanho, e2e gate/combate-bot/fichas),
  `npm run capture`, `window.__LOBO__`, overlay `?perf=1`, bot de teste.
- Deploy: GitHub Actions → GitHub Pages (`.github/workflows/deploy.yml`).

### Márcio v1 (feito)
- `tools/blender/build_character.py` + receita `data/characters/marcio.json` → `public/assets/characters/marcio.glb`
  e `public/assets/anims/humanoid_anims.glb` (43 clipes no esqueleto ajustado). Renders de conferência em
  `.agent-tmp/characters/marcio/{front,side,face,pose}.png`. Rodar:
  `BLENDER_USER_RESOURCES=C:/Ferramentas/Blender-spike-profile "C:/Program Files/Blender Foundation/Blender 4.2/blender.exe" -b --python tools/blender/build_character.py -- --recipe data/characters/marcio.json --anims`
- Corpo MPFB2 (macros + alvos de barriga/braços/ombros), esqueleto UAL com juntas movidas (DEC-0009), roupas por casca
  com cortes por plano + suavização, tênis por casco convexo com pesos explícitos, cabelo penteado para trás, barba
  com alfa por cor de vértice, olhos/dentes/cílios dos helpers do MPFB.
- Runtime: `src/engine/render/materialLibrary.ts` troca materiais por nome (malha de polo, sarja de jeans, íris,
  barba/cabelo com fios) — tudo procedural no navegador.

### Próximo passo (em ordem)
1. **Inimigos com o mesmo pipeline**: receitas `data/characters/thug_*.json` (corpos variados, roupas/cores,
   cabelo/barba/careca), offset de pelve por esqueleto no runtime (as animações vêm com a pelve do Márcio),
   variação por instância (tint). Substituir os manequins.
2. Rosto do Márcio ainda genérico → M3 (WWE 2K). Olhos parecem fechados de longe (íris pequena) — revisar.
3. M3 rosto WWE 2K (MediaPipe → fit → projeção).
4. M2 restante: knockdown/levantar (CMU get-up), finalizações, agarrão/arremesso, armas, mais reações.
5. M5 lobisomem (o áudio já está em `assets-src/audio/`; `audio.playVoice` já faz o ducking).

### Evidências
- Último verify: PASS (ver `.agent-tmp/verify/` — local, não versionado).
- Capturas do combate: `.agent-tmp/captures/` (local).

### NÃO VALIDADO
- Performance na RTX 3050: o Chromium do Playwright e o painel embutido usam a **Iris Xe** (60 FPS no Medium,
  picos de p99 ~145 ms provavelmente por compilação de shader na primeira morte/sangue — pré-compilar).
- Controles de toque e orientação em celular real.
- Gamepad (mapeado, não testado com controle físico).

### Dívidas conhecidas
- Ragdoll sem limites de junta (joelho pode dobrar errado) — a versão do Rapier não expõe motor em junta esférica;
  usa amortecimento angular. Revisar com juntas genéricas/revolutas.
- Corpos T3 (malha baked mesclada) ainda não implementados — corpos ficam em T2 (1–2 draw calls cada).
- Navmesh ainda não usada (sandbox aberto); entra no M6.
