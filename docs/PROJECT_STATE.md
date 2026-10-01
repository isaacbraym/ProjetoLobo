# PROJECT_STATE — ponto de retomada

Atualizado: 2026-10-01 · Por: sessão 1 (Claude Opus 5.5, "ultracode")

## RETOMAR AQUI
**Milestone atual:** M0 concluído · **M2 (vertical slice de combate) em andamento** com personagem provisório
(manequim Quaternius). **M1 (Márcio de verdade) é o próximo grande passo** — ver "Próximo passo".

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

### Próximo passo (em ordem)
1. **M1 — Márcio v1 no Blender** (prioridade nº 2 do usuário): gerar corpo MPFB2 por script
   (`tools/blender/`), ajustar o esqueleto do Quaternius (`public/assets/anims/ual1_src.glb`, nomes UE) às juntas do
   corpo MPFB2 mantendo as rotações de repouso → as animações UAL servem sem retarget. Roupas por casca (polo
   verde-oliva, jeans, tênis), cabelo/barba v1. Ver `docs/ASSET_PIPELINE.md` §2/§4 e a decisão DEC-0009.
2. Inimigos com o mesmo pipeline (corpos-base + variação), substituindo os manequins.
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
