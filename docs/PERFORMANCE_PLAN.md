# PERFORMANCE_PLAN — Projeto Lobo

Data: 2026-09-30 · Status: **PROPOSTO** — números são metas iniciais; ajustar por medição registrada em `DECISIONS.md`.

## 1. Máquinas de referência
| Perfil | Máquina | Preset alvo | Meta |
|---|---|---|---|
| **DESKTOP_REF** | Dell G15 5520 · i5-12500H · **RTX 3050 Laptop 4 GB** · 16 GB · Chrome atual · 1920×1080 | **High** | **60 FPS** médio, 1% low ≥ 45 |
| MOBILE_MID | Android intermediário (ex.: Galaxy A5x) / iPhone 12–13 · Chrome/Safari | **Medium** | 45–60 FPS, piso 30 |
| MOBILE_LOW | Android de entrada (Mali/Adreno 6xx baixo) | **Low** | 30 FPS estáveis |
| ULTRA | Desktop com GPU ≥ 8 GB | **Ultra** | 60+ FPS com tudo ligado |

Herança do Bairro: medir com notebook **na tomada**, perfil de energia fixo, **GPU confirmada** (o script lê
`WEBGL_debug_renderer_info` e reprova a medição se não for a NVIDIA), 1 min de aquecimento, percurso e seed fixos,
mediana de 3 rodadas. No Windows, configurar o Chrome do Playwright como "Alto desempenho" nas Configurações de Gráficos
se ele cair na Iris Xe (registrar em `PENDENCIAS.md` se precisar do usuário).

## 2. Orçamentos por frame (pior caso de combate: 10 inimigos, 4 civis visíveis, 2 ragdolls, partículas)
| Recurso | High (DESKTOP_REF) | Medium (MOBILE_MID) | Low |
|---|---|---|---|
| Frame | ≤ 16,6 ms | ≤ 22 ms (meta 16,6) | ≤ 33 ms |
| CPU JS total (sim + anim + render submit) | ≤ 9 ms | ≤ 12 ms | ≤ 16 ms |
| ↳ física (Rapier step) | ≤ 2,0 ms | ≤ 2,5 ms | ≤ 3,0 ms |
| ↳ IA + nav crowd | ≤ 1,0 ms | ≤ 1,5 ms | ≤ 2,0 ms |
| ↳ animação (mixers + IK) | ≤ 2,5 ms | ≤ 3,5 ms | ≤ 4,0 ms |
| **Draw calls** | ≤ 400 | ≤ 180 | ≤ 120 |
| Triângulos visíveis | ≤ 1,5 M | ≤ 500 k | ≤ 250 k |
| Memória de textura (GPU) | ≤ 700 MB | ≤ 250 MB | ≤ 150 MB |
| JS heap | ≤ 350 MB | ≤ 250 MB | ≤ 200 MB |
| DPR efetivo | até 1,5 (dinâmico) | 1,0–1,5 (dinâmico) | 0,75–1,0 |

## 3. Contagens máximas
| Item | High | Medium | Low |
|---|---|---|---|
| Inimigos em combate ativo (anim 60 Hz) | 10 | 6 | 4 |
| Inimigos/civis vivos no andar (lógica) | 60+ (zonas inativas dormem) | 60+ | 60+ |
| Civis animados visíveis | 12 | 8 | 4 |
| Ragdolls ativos (T1) | 6 | 3 | 2 |
| Corpos congelados (T2) | 12 | 6 | 3 |
| Corpos baked (T3) | ilimitado (≈2k tris cada, lote por zona) | idem (LOD mais baixo) | idem + decal de sangue simplificado |
| Peças de desmembramento ativas | 8 | 4 | 2 |
| Debris dinâmicos | 60 | 30 | 15 |
| Decals (sangue/impacto) | 256 | 128 | 64 |
| Partículas vivas | 4000 | 1500 | 600 |
| Luzes dinâmicas por sala | 3 + 1 com sombra | 1 + blob shadows | 0–1 + blob shadows |
| Shells de pelo do lobo | 16 | 8 | 0 (cartões) |

## 4. Presets (um jogo, sistemas escaláveis)
| Sistema | Low | Medium | High | Ultra |
|---|---|---|---|---|
| Sombras | blob (decal) | blob + 1 spot 512 perto do player | 1 directional/spot 1024 (só personagens) | 2048 + 2 spots |
| Pós | tonemap + vinheta | + bloom leve + FXAA | + SMAA + bloom seletivo + LUT + CA em golpes | + SSAO + DOF em cinemáticas |
| Texturas | 512 | 1024 | 2048 | 2048 |
| Anim LOD (perto/médio/longe) | 30/15/0 | 60/20/10 | 60/30/15 | 60/60/30 |
| IK de pés | não | só Márcio | Márcio + 3 mais próximos | todos próximos |
| Reflexos | env map | env map | env map + reflexo planar fake só no piso do átrio | planar real no átrio |
| CCTV nas TVs | não | não | sim (baixa res) | sim |
| HRTF 3D | não | não | sim | sim |

**Detecção automática:** no primeiro carregamento, lê o renderer, testa ~3 s de cena de benchmark e escolhe o preset;
o jogador pode trocar. **Resolução dinâmica:** ajusta o DPR em degraus para manter a meta de FPS do preset (com histerese).

## 5. Técnicas obrigatórias desde o M0
- **Draw calls:** geometria estática mesclada por material e fatiada por sala; props repetidos em `InstancedMesh`;
  inimigos mesclados em 1–2 `SkinnedMesh`; barras de vida, partículas e decals instanced; atlas para props/roupas.
- **Culling:** frustum (nativo) + **culling por zona/portal** (salas atrás de portas fechadas ficam invisíveis; zonas
  conectadas em grafo simples); distância de desenho por classe de objeto.
- **LOD:** malhas (props e personagens), animação (taxa), IA (frequência de decisão), física (ragdoll → congelado → baked).
- **Pools:** hitboxes, projéteis, partículas, decals, sons, ragdolls, peças de debris, vetores/quaternions temporários.
- **Sem alocação por frame:** proibido `new Vector3()` em update; reusar temporários de módulo.
- **Física:** sleeping ligado, colisão simplificada (caixas/cápsulas), CCD só para arremessos rápidos.
- **Texturas comprimidas** (KTX2) e mipmaps; nenhuma textura > 2048 sem registro.
- **Shaders:** pré-compilar materiais no loading (`renderer.compile`) para evitar travadas ao aparecer o primeiro inimigo,
  sangue ou lobisomem.
- **Carregamento:** gate leve → menu → andar 1; andar seguinte pré-carregado em segundo plano; decodificação em workers.

## 6. Carregamento e download
| Etapa | Meta (conexão de 20 Mbps) |
|---|---|
| Gate de senha visível | ≤ 1 s (≤ 100 KB) |
| Menu jogável | ≤ 5 s (≤ 15 MB) |
| Andar 1 jogável após "Jogar" | ≤ 15 s (≤ 40 MB acumulado) |
| Troca de andar | escondida pela cena do elevador (pré-carga) |
| Visitas seguintes | cache HTTP (nomes com hash) — quase instantâneo |

## 7. Medição e regressão (automatizadas)
- **Overlay de perf** (`?perf=1`): FPS, ms por sistema (física, IA, anim, render), draw calls (`renderer.info`),
  triângulos, texturas, geometrias, heap (`performance.memory` quando houver), ragdolls/corpos/partículas por tier,
  preset e DPR. Também acessível por `window.__LOBO__.perf()`.
- **Cenário `perf-stress`**: seed fixa, câmera em percurso, 10 inimigos lutando contra o bot, mortes e ragdolls, lobisomem
  ativado no meio → grava `perf.json` (média, p95, p99, 1% low, ms por sistema, picos).
- `npm run perf` roda o cenário no Chromium **com GPU real** (headed/ANGLE D3D11) e compara com `tests/baselines/perf.json`.
- **Regra de regressão (do Bairro):** > 5% de frame médio, > 10% de draw calls ou > 50 MB de textura vs baseline →
  `PERF REVIEW` obrigatório antes de seguir (corrigir ou registrar dívida `PERF-DEBT-xxxx` em `docs/DEBT.md` com prazo).
- **Mobile real:** o agente não tem celular. Entrega um link (`npm run dev -- --host` na rede local, ou o deploy) e um
  checklist para o usuário com o overlay de perf; valores reportados viram `PENDENCIAS`/`DECISIONS`. Antes disso, a
  emulação do Playwright (viewport/toque/landscape) valida **layout e controles**, nunca performance.
