# PROJECT_STATE — ponto de retomada

Atualizado: 2026-09-30 · Por: sessão de arquitetura (Claude Opus 5.5)

## Fase
**Pré-M0 — arquitetura e documentação concluídas, aguardando revisão do usuário.** Nenhum código de jogo ainda.

## Feito
- Análise do Projeto_Bairro (Unreal) → `docs/ANALYSIS.md`.
- Decisão de stack (DEC-0001) → `docs/TECH_STACK_DECISION.md`.
- Arquitetura, pipeline de assets (incl. rosto estilo WWE 2K), game design, performance, roadmap, riscos.
- Prompt mestre de construção → `docs/MASTER_BUILD_PROMPT.md`.
- Estrutura de pastas criada; referências copiadas para `refs/` (fora do Git); áudio da transformação em
  `assets-src/audio/sfx_transform_fala_lobinho.mp3`.
- Lista do Mixamo para o usuário → `docs/MIXAMO_DOWNLOAD_LIST.md`.

## Próximos passos
1. Usuário revisa os docs e preenche `AUTORIZACAO_PUSH_DEPLOY` no topo do `MASTER_BUILD_PROMPT.md`.
2. (Opcional, em paralelo) usuário baixa as animações do Mixamo para `assets-src/vendor/mixamo/`.
3. Nova sessão executa `docs/MASTER_BUILD_PROMPT.md` a partir do M0.

## NÃO VALIDADO
- Todas as metas de performance (nenhuma medição ainda).
- Disponibilidade/versão exata de dependências npm e do pacote MediaPipe Tasks (verificar na instalação).
- Inventário real da Quaternius UAL (quais golpes existem).
