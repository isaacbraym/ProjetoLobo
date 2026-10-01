# DECISIONS — log de decisões

Formato: `DEC-xxxx · data · status · decisão · motivo · origem`. Status: PROPOSTA | APROVADA | SUBSTITUÍDA.

| ID | Data | Status | Decisão | Motivo | Origem |
|---|---|---|---|---|---|
| DEC-0001 | 2026-09-30 | PROPOSTA | Stack: TS + Vite + Three.js (WebGL2) + Rapier + recast-navigation; Blender 4.2 + MPFB2 para assets; Vitest + Playwright; GitHub Pages | Maior domínio do Claude, automação por código, leveza, mobile, deploy sem cabeçalhos | `TECH_STACK_DECISION.md` |
| DEC-0002 | 2026-09-30 | APROVADA | Repo público + GitHub Pages + senha simples de 4 dígitos (texto só em `.env.local`, fora do Git; hash no cliente) | Escolha do usuário, ciente de que é barreira casual | Resposta do usuário |
| DEC-0003 | 2026-09-30 | APROVADA | Assets 100% automáticos no início; usuário baixa Mixamo a partir de lista | Escolha do usuário | Resposta do usuário |
| DEC-0004 | 2026-09-30 | APROVADA | Rosto pela técnica "Face Photo" estilo WWE 2K; sem serviços de imagem→3D | Escolha do usuário | Resposta do usuário |
| DEC-0005 | 2026-09-30 | APROVADA | Skin desbloqueável "Márcio Herói" a partir da 2ª imagem | Escolha do usuário | Resposta do usuário |
| DEC-0006 | 2026-09-30 | APROVADA | Clóvis: sorriso arregalado permanente, bengala (principal), perna-cobra (secundária) | Indicação do usuário | Resposta do usuário |
| DEC-0007 | 2026-09-30 | PROPOSTA | Esqueleto único MPFB2 `game_engine`; lobisomem como morph targets da malha do Márcio | Todas as animações servem a todos; transformação real por morph | `ARCHITECTURE.md`, `ASSET_PIPELINE.md` |
| DEC-0008 | 2026-09-30 | PROPOSTA | Áudio da transformação com ducking −18 dB + passa-baixa na música | Pedido "abafar bem a música" | Mensagem do usuário |
| DEC-0009 | 2026-10-01 | PROPOSTA | Esqueleto de runtime = esqueleto UE do Quaternius UAL (65 ossos, `Head` maiúsculo). Corpos MPFB2 são riggados nele ajustando só as posições das juntas (rotações de repouso preservadas) → clipes UAL servem sem retarget; Mixamo/CMU retargetados offline para ele | Mais rápido e robusto que retargetar tudo para o `game_engine` do MPFB2 | sessão 1 |
| DEC-0010 | 2026-10-01 | APROVADA | Push/deploy automático autorizado pelo usuário | Pedido do usuário | mensagem do usuário |
| DEC-0011 | 2026-10-01 | APROVADA | Portas: dev 5180, preview 4180 (5173/4173 são do projeto Karimbolandia) | Conflito de porta | sessão 1 |
| DEC-0012 | 2026-10-01 | APROVADA | Sangue só em golpe crítico, arma branca/garra (`bleed`) ou golpe fatal; demais acertos mostram impacto seco. Crítico = sorteio por golpe (`critChance`, padrão 5%/15%), contra após esquiva perfeita ou pesado em alvo atordoado; 1,5× dano | Pedido do usuário | mensagem do usuário |
| DEC-0013 | 2026-10-01 | APROVADA | Corpos mais pesados: empurrão menor com atrito alto, dividido pela massa do arquétipo (`mass`: thug 1,0 / fast 0,85 / heavy 1,9); impulso de ragdoll e de finalização reduzidos | Pedido do usuário | mensagem do usuário |
| DEC-0014 | 2026-10-01 | APROVADA | Rosto do Márcio passa a usar a foto real `refs/marcio/marcio_face_real.png` (frontal, 659x659) na técnica WWE 2K; a imagem antiga segue como referência de corpo/roupa | Foto melhor enviada pelo usuário | mensagem do usuário |
| DEC-0015 | 2026-10-01 | APROVADA | Foto do rosto versionada sem extensão (`assets-src/characters/marcio_face_src`) e textura de jogo do rosto sem extensão; prioridade é o rosto idêntico (camuflagem leve, não proteção) | Autorização do usuário | mensagem do usuário |
| DEC-0016 | 2026-10-01 | APROVADA | Controles desktop "poucos botões": esquerdo soco/segurar forte, direito chute/segurar forte, Shift esquiva/correr, Ctrl (ou C) contextual, Espaço/F especial, mouse escolhe o alvo, lobo come com clique direito no corpo, G alterna câmera-mira ↔ câmera livre; tela cheia + Keyboard Lock contra Ctrl+W | Pedido do usuário | mensagem do usuário |
| DEC-0017 | 2026-10-01 | APROVADA | Sem ondas: o jogo é exploração do prédio rica em detalhes, com inimigos posicionados (patrulha, vigiando reféns, descansando) e arenas pontuais; o loop de ondas fica só como cena de teste | Pedido do usuário | mensagem do usuário |
