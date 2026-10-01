# RISK_REGISTER — Projeto Lobo

Data: 2026-09-30 · Status: **PROPOSTO** · Escala: Probabilidade (P) e Impacto (I) de 1 a 5.
Regra: quando um risco disparar, registrar em `docs/DECISIONS.md` qual plano foi adotado.

| ID | Risco | P | I | Plano A | Fallback | Gatilho para o fallback |
|---|---|---|---|---|---|---|
| R01 | **Fidelidade facial insuficiente** (Márcio "parecido", não "é ele") | 4 | 5 | Pipeline WWE 2K (landmarks → fit linear MPFB2 → RBF → projeção → blend Lab) com métrica automática e iteração | (1) Estilização maior do shading (rim/cel suave) que esconde erro de forma e valoriza a textura; (2) câmera de close evita perfil puro; (3) pedir ao usuário uma foto lateral real do Márcio (`PENDENCIAS`) | Erro de landmark > 3% ou SSIM < 0,80 depois de 3 iterações |
| R02 | **Animação pobre** (poucas, robóticas) | 4 | 5 | CC0 (Quaternius UAL + CMU) + polimento automático + autoria por script com contact sheet + camadas procedurais | Lista Mixamo (`docs/MIXAMO_DOWNLOAD_LIST.md`) — o usuário já aceitou baixar | Inventário CC0 sem ≥ 4 golpes leves, 2 pesados, 1 chute, 3 reações, 2 mortes utilizáveis |
| R03 | **Corrida quadrúpede ruim** | 4 | 3 | Galope autorado por pose-chave + IK no chão + raiz sincronizada | Corrida bípede curvada e baixa, braços abertos, com os mesmos efeitos de velocidade | Contact sheet com mãos atravessando o chão/deslizando após 3 iterações |
| R04 | **Ragdoll mole/bizarro** | 3 | 4 | 11 corpos, massas realistas, limites por osso, damping, velocidade herdada da animação | Morte por animação + ragdoll só no final do clip (blend curto) | Juntas invertidas ou "voo" em > 5% das mortes no cenário de 100 mortes |
| R05 | **Corpos persistentes estouram perf** | 3 | 4 | Tiers T1/T2/T3 + lote por zona + LOD 2k | T3 com LOD 800 tris; acima de 120 corpos numa zona, os mais antigos fora de vista viram decal + "pilha" de corpos instanced | Draw calls ou tris acima do orçamento no perf-stress |
| R06 | **Desmembramento frágil** (buracos, peças erradas) | 3 | 3 | Peças pré-separadas no Blender com tampas + escala de osso + peça baked | Só decapitação e braço (2 pontos) + jato de sangue que cobre o corte | Artefatos visíveis em captura após 2 iterações |
| R07 | **Mobile lento ou com HUD ruim** | 4 | 4 | Presets + DPR dinâmico + Medium enxuto + HUD em DOM | Low ainda mais agressivo (sem pós, sombras blob, 3 inimigos ativos, ondas menores no mobile) | < 30 FPS no MOBILE_MID relatado pelo usuário |
| R08 | **iOS não gira/fullscreen** | 5 | 2 | Overlay de rotação + layout que funciona em landscape + PWA | — (limite da plataforma, documentado) | — |
| R09 | **Muitos NPCs sobrecarregam CPU** | 3 | 4 | Tokens limitam atacantes; IA a 10 Hz escalonada; anim LOD; zonas inativas dormem | Menos inimigos simultâneos por onda (ondas mais curtas e mais numerosas) | IA+anim > orçamento no perf-stress |
| R10 | **Destruição "de papel" ou cara** | 3 | 3 | Tabela de materiais + integridade + fratura pré-calculada + pool de debris | Menos props destrutíveis (só os de "show"), o resto só treme/empurra | Debris > orçamento ou sensação errada nas capturas |
| R11 | **Performance geral abaixo de 60 no DESKTOP_REF** | 3 | 5 | Orçamentos desde o M0, perf-stress em cada milestone, regra de regressão | Reduzir pós e sombras do High; DPR 1,25; lightmap menor | Regressão > 5% sem explicação |
| R12 | **Bosses viram "inimigo com mais HP"** | 3 | 4 | Fases + golpes exclusivos + intro + arena + música + finalização especial (Clóvis com bengala e cobra) | Reduzir para 2 fases bem feitas | — |
| R13 | **Transformação sem impacto** | 3 | 5 | Close frontal + morph na mesma malha + pelo + rasgo + luz + ducking + rugido com onda de choque | Corte esperto: flash/sangue/partículas no meio escondendo a troca de malha; manter close e áudio | Captura de 8 frames não mostra transformação legível |
| R14 | **Assets estouram o tamanho** (> 150 MB) | 2 | 3 | KTX2 + Meshopt + texturas por preset + orçamento no `assets:check` | WebP/AVIF, menos variantes de roupa, música em bitrate menor | `assets:check` falha |
| R15 | **Senha contornada** | 5 | 1 | Gate com hash; aceito pelo usuário como barreira casual | — | — |
| R16 | **Licença de asset problemática** | 2 | 3 | Só CC0/CC-BY/royalty-free; `CREDITS.md`; brutos fora do Git | Substituir o asset | Origem/licença não confirmada na fonte |
| R17 | **Pessoas reais retratadas** (rostos do Márcio e do Clóvis num repo público, inclusive o Clóvis como boss que apanha) | 2 | 3 | Fotos originais fora do Git; só texturas processadas | Trocar textura facial por versão mais estilizada | Pedido de qualquer pessoa retratada |
| R18 | **Agente perde o fio em sessão longa** | 3 | 4 | `PROJECT_STATE.md` atualizado a cada marco; commits pequenos; `verify` como portão | Retomar pelo `AGENTS.md` | — |
| R19 | **Blender/MPFB2 quebra em modo headless** | 2 | 4 | Perfil isolado já provado no spike; relatório por etapa | Geração de malha base por script sem MPFB2 (base CC0 importada), pior qualidade | Falha repetida (3×) com mesma causa |
| R20 | **Música genérica** (CC0) | 4 | 2 | Seleção cuidadosa + mixagem dinâmica | Usuário gera no Suno com `docs/MUSIC_PROMPTS.md`; troca só em `data/audio/music.json` | Usuário pedir |
| R21 | **Playwright usa a GPU integrada/SwiftShader** e mede errado | 4 | 3 | Script reprova se o renderer não for NVIDIA; headed + ANGLE D3D11 | Usuário define "Alto desempenho" para o Chromium no Windows (`PENDENCIAS`) | Renderer ≠ NVIDIA |
| R22 | **Escopo engole o tempo** | 4 | 4 | Milestones com saída jogável; prioridades do brief; "10 excelentes > 50 ruins" | Cortar segredos, andar 3 menor, bosses 2/3 placeholder | Milestone estourando 2× o previsto |
