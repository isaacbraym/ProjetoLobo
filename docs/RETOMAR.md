# RETOMAR — prompt para continuar em outra sessão/conta

Cole isto numa sessão nova do Claude Code aberta em `C:\PROJETOS\Lobo`:

```
Você está continuando o desenvolvimento do jogo "Márcio" (Projeto Lobo) em C:\PROJETOS\Lobo, iniciado por outra sessão do Claude Code que atingiu o limite. Não recomece nada: retome.
1) Leia nesta ordem: AGENTS.md → docs/PROJECT_STATE.md (seção "RETOMAR AQUI") → PENDENCIAS.md → docs/MASTER_BUILD_PROMPT.md (contrato; push/deploy AUTORIZADO).
2) Rode: git log --oneline -25 ; git status ; npm install ; npx playwright install chromium ; npm run verify:quick
3) Suba o jogo para o usuário ver: preview "lobo-dev" do .claude/launch.json (http://localhost:5180/ProjetoLobo/). Portas 5173/4173 são de OUTRO projeto (Karimbolandia) — não mexa.
4) Continue exatamente do "Próximo passo" do PROJECT_STATE, seguindo o MASTER_BUILD_PROMPT e o DEVELOPMENT_ROADMAP.
5) Commit + push a cada avanço com verify verde; atualize docs/PROJECT_STATE.md a cada marco (outra sessão pode precisar retomar de novo).
```

## Dicas rápidas para quem retoma
- Ver o jogo sem menu e com bot lutando: `http://localhost:5180/ProjetoLobo/?autotest=1&bot=1&perf=1`
- Capturas para revisão visual: `npm run capture` (salva PNGs em `.agent-tmp/captures/<data>/`; abra com a ferramenta de leitura de imagem).
- O painel do navegador embutido reduz FPS quando está em segundo plano — use `npm run capture` para validar visual.
- `window.__LOBO__` (só dev/autotest): `state()`, `spawn('heavy')`, `bot(true)`, `godMode(true)`, `perf()`, `killAll()`…
- Senha do gate: em `.env.local` (fora do Git). Se faltar, crie a partir de `.env.example` e rode `npm run gate:hash`.
