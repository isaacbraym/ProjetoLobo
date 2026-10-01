# ASSET_PIPELINE — Projeto Lobo

Data: 2026-09-30 · Status: **PROPOSTO**
Regra-mãe: **todo asset é gerado por script, a partir de fonte versionada ou de download registrado, com relatório JSON
e validação da própria saída.** Nenhuma etapa depende de cliques do usuário. (Exceção opcional: downloads do Mixamo
feitos pelo usuário a partir de `docs/MIXAMO_DOWNLOAD_LIST.md`.)

## 0. Ferramentas e ambiente
| Ferramenta | Onde | Uso |
|---|---|---|
| Blender 4.2 | `C:\Program Files\Blender Foundation\Blender 4.2\blender.exe` | Sempre `--background --python <script> -- <args>`; **um por vez** |
| MPFB2 2.0.17 | perfil isolado `C:\Ferramentas\Blender-spike-profile` (env `BLENDER_USER_RESOURCES`) | Corpo, rosto, macros, esqueleto `game_engine` (CC0 dos assets; código GPL só como ferramenta) |
| Node 24 + glTF-Transform | `npm` | Otimização, Meshopt, resize, manifesto |
| KTX-Software (`toktx`) | baixar release oficial (Apache-2.0) para `tools/bin/` | KTX2 (UASTC/ETC1S) |
| ffmpeg | `C:\ffmpeg\bin` | Áudio (loudnorm, corte, AAC), conversões de imagem |
| Playwright + Chromium | `npm` | MediaPipe no navegador, capturas, verify |
| Python 3.13 | sistema | Scripts auxiliares fora do Blender (opcional) |

**Referências de implementação (somente leitura, outro projeto):** o spike do Bairro já resolveu partes deste pipeline.
Ler antes de escrever do zero (não copiar cegamente; não editar):
`C:\PROJETOS\Projeto_Bairro\Spike\ENG-001\Shared\Humanoid\make_humanoid.py` (gerar humanoide MPFB2 por script),
`...\Shared\Anim\retarget_anims.py`, `fetch_sources.py`, `asf_amc.py` (baixar e retargetar CMU/Quaternius),
`...\Shared\Automation\*.py` (variante de NPC, correção de animação por frame + reimport).

Cada script Blender: recebe args, escreve **um** relatório `*.report.json` (entradas, hashes, contagens: ossos, tris,
materiais, clips, durações, altura em metros) e **falha com código ≠ 0** se a validação da saída falhar.

## 1. Esqueleto único
- MPFB2 `game_engine` (53 ossos, nomes estilo UE Mannequin: `root, pelvis, spine_01..03, neck_01, head, clavicle_l…`).
- Escala: metros, Y-up no glTF, altura de referência 1,75 m (Márcio).
- **Todos** os humanos usam esse esqueleto. Peças extras (garras, orelhas, cobra) usam ossos-filho próprios em malhas
  separadas, sem alterar o esqueleto base.
- `tools/blender/rig_check.py` valida: nomes, hierarquia, pose de repouso, orientação, escala.

## 2. Corpo do Márcio (silhueta por foto)
1. Segmentar a silhueta de `refs/marcio/marcio_front.png` (fundo cinza uniforme → limiar + morfologia).
2. Medir larguras normalizadas por altura (ombro, peito, cintura/barriga, quadril, coxa, panturrilha, braço).
3. MPFB2: macros iniciais (masculino, ~45 anos, peso alto, músculo médio-alto, 1,75 m) e **ajuste linear** dos
   modificadores de corpo (targets são blendshapes lineares → mínimos quadrados com limites) até a silhueta renderizada
   em ortográfica frontal bater com a da foto (erro de largura < 3% por faixa).
4. Relatório + `silhouette_compare.png` (foto | render | sobreposição).

## 3. Rosto — técnica "Face Photo" estilo WWE 2K (núcleo da fidelidade)
Mesma família de técnica dos jogos de luta com upload de rosto: **pontos do rosto na foto → deformar uma cabeça base até
bater → projetar a foto como textura → misturar com pele gerada nas bordas**. Tudo automático:

| Etapa | O que faz | Saída |
|---|---|---|
| F1 Preparar | recorte alinhado do rosto; *delighting* leve (divide a luminância da pele por um blur grande, preservando detalhe) | `face_prepped.png` |
| F2 Landmarks | página local `tools/face/landmarks.html` com MediaPipe Face Landmarker (`@mediapipe/tasks-vision`, modelo baixado uma vez para `tools/bin/`) aberta pelo Playwright → **478 pontos (x, y, z relativo) + 52 coeficientes de expressão + matriz de pose da cabeça** | `landmarks.json` |
| F3 Correspondência (uma vez por cabeça-base) | alinhar a cabeça MPFB2 ao *canonical face model* do MediaPipe (Apache-2.0) por ICP rígido+escala; vértice mais próximo por landmark → tabela | `tools/face/correspondence_game_engine.json` + render de checagem com pontos |
| F4 Ajuste macro | modificadores faciais do MPFB2 (forma da cabeça, olhos, nariz, boca, queixo, mandíbula, bochechas, orelhas) são blendshapes **lineares** → mínimos quadrados com limites sobre a diferença projetada dos landmarks (após normalizar pose/escala) | pesos dos modificadores |
| F5 Resíduo | deformação RBF (thin-plate) restrita à região facial para zerar o erro restante no plano frontal; profundidade guiada pelo `z` do MediaPipe (peso 0,5) + suavização Laplaciana | malha da cabeça ajustada |
| F6 Projeção | câmera estimada pela matriz de pose (perspectiva ~50 mm); projeta a foto; **bake** para a UV principal (Cycles, emissão) só onde `normal·view > 0,3`, com transição suave até 0,15 | `face_proj.png` + `face_mask.png` |
| F7 Mistura de pele | pele-base procedural (tom amostrado de testa/bochechas + poros + variação de cor) ; *color transfer* em Lab entre foto e pele-base para sumir a costura; orelhas, nuca e corpo da pele-base | `head_albedo.png` 2048² |
| F8 Olhos, dentes, sobrancelhas | olhos MPFB2 (CC0) com cor de íris amostrada; dentes/língua MPFB2; sobrancelha = projeção + pequena casca | malhas e texturas |
| F9 Cabelo e barba | **cabelo:** calota (offset da região do couro cabeludo) com textura projetada da linha do cabelo + 2–3 cascas para volume penteado para trás. **Barba:** casca da região de mandíbula/queixo (offset 3–8 mm) com alfa vindo da segmentação da barba (diferença de cor vs pele) + ruído de fios → volume visível de perfil | malhas + atlas alfa |
| F10 Morphs de expressão | gerados por script: `jawOpen`, `blink_L/R`, `browAngry`, `snarl`, `roar` (rotação com falloff em torno de pivôs + grupos de vértices) | morph targets |
| F11 Validação automática | render neutro da cabeça pela câmera estimada → MediaPipe no render → **erro médio de landmark normalizado pela distância interocular** + SSIM do recorte facial; renders 3/4 e perfil para inspeção | `face_report.json` + `face_compare.png` (foto \| render \| sobreposição \| 3/4 \| perfil) |

**Metas:** erro de landmark ≤ 3% da distância interocular; SSIM do recorte ≥ 0,80; inspeção visual do agente das 5
vistas com checklist (proporção nariz/boca/olhos, linha do cabelo, barba grisalha no queixo, sobrancelha grossa, olhar
sério). Iterar F4–F9 até passar. No jogo: cena `?scene=face-compare&char=marcio`.
**Limite honesto:** só há foto frontal → perfil é inferido. A imagem do herói (`refs/marcio_hero/`) serve como segunda
foto frontal com outra iluminação, só para validar F7 (não melhora o perfil).

## 4. Roupas (cascas do corpo + textura projetada)
Para roupas justas/médias (polo, camiseta, calça jeans, blazer, jaqueta), o método mais robusto e automático:
1. Selecionar a região do corpo (grupos de vértices MPFB2) → duplicar → *offset* pela normal (2–15 mm conforme a peça)
   → recortar bainhas/gola → adicionar geometria procedural (gola da polo, lapela do blazer, bolsos e costura por textura).
2. **Pesos copiados do corpo** (transferência de pesos) → a roupa já nasce riggada no esqueleto único.
3. Textura: frente projetada da foto de referência (Márcio: polo verde-oliva com friso cinza/branco na gola e na manga;
   jeans azul; tênis marrom) + costas sintetizadas (espelho/extrapolação + ruído de tecido) + normal map de tecido
   procedural.
4. Esconder o corpo por baixo (máscara de alfa/remoção de faces cobertas) para evitar z-fighting e economizar triângulos.
Sapatos: malha MPFB2 (CC0) ou procedural, com textura projetada.

## 5. Lobisomem Márcio (mesma malha + morph targets)
A referência mostra **o rosto do Márcio preservado**: orelhas de lobo, nariz preto de animal, presas, olhos âmbar, barba e
cabelo iguais, braços e mãos enormes e peludos, garras, roupas rasgadas com pelo aparecendo. Implementação:
- **Morph `wolf_body`:** ombros/trapézio, peito, braços/antebraços/mãos ~1,4× (garantido por escala de osso também),
  pescoço mais grosso. Postura curvada vem da animação (camada aditiva).
- **Morph `wolf_face`:** testa/arcada mais pesada, nariz projetado com ponta escura, lábio superior puxado (presas),
  bochechas com pelo. Orelhas humanas encolhem (morph) e **orelhas de lobo** crescem (malha extra, escala 0→1).
- **Garras** (malha extra por dedo, escala 0→1) e dedos alongados (morph).
- **Pelo:** *shells* (cascas) instanciadas num único draw call, só nas regiões de pele exposta e nos rasgos (braços,
  mãos, pescoço, laterais do rosto, rasgos da roupa); 0/4/8/16 cascas por preset (Low usa cartões + textura).
- **Roupa rasgando:** máscara de dissolve com ruído na textura da roupa; bordas com franja; por baixo, corpo com pelo.
- **Olhos** âmbar com leve emissivo.
- Um único parâmetro `wolfAmount` (0→1) dirige tudo por curvas em `data/cinematics/transform.json`.

## 6. Clóvis B. (Boss 1)
- Rosto: pipeline §3 com `refs/clovis/clovis_face.png` (principal) e `clovis_body.jfif` (segunda vista). **Expressão
  característica permanente:** sorriso arregalado com dentes à mostra e olhos muito abertos → o ajuste F4/F5 é feito
  **com a boca aberta** (malha da boca segue os landmarks do sorriso; dentes MPFB2 visíveis), não com textura de dentes
  pintada numa boca fechada.
- Corpo: MPFB2 masculino, ~60 anos, porte médio/forte, careca (couro cabeludo com especular leve, sem cabelo).
- Roupa: **blazer branco** (casca + lapelas), **camiseta listrada azul-marinho/branca** (listras procedurais), calça
  escura, sapatos.
- **Bengala** (arma principal): curva de Blender → haste reta com cabo em gancho preto, madeira com anéis escuros como na
  foto; usada para ganchos, varridas, estocadas e para **puxar o Márcio pelo pescoço com o gancho**.
- **Perna-cobra** (arma secundária, fase 2): perna direita abaixo do joelho oculta por escala de osso; cobra = tubo
  procedural com cadeia própria de 14–16 ossos, escamas procedurais, cabeça com mandíbula; animação **procedural em
  runtime** (IK FABRIK até o alvo + onda senoidal + bote). Transição com VFX (a calça rasga, a perna "desenrola").
- **Atenção:** a foto do Clóvis tem texto sobreposto ("part 6742") → recortar/inpaint simples antes do F1.

## 7. Skin desbloqueável — Márcio Herói
Mesmo corpo/rosto. Traje por cascas (§4) com texturas procedurais fiéis a `refs/marcio_hero/`: macacão verde com painéis
amarelos, luvas/botas/ombreiras/joelheiras azuis, cinto marrom com fivela, emblema do peito e bandeira no ombro (texturas
fáceis de trocar), **capa amarela com física de pano barata** (grade verlet ~12×16 presa nos ombros, colisão com cápsulas
do corpo). Desbloqueia ao zerar o jogo.

## 8. Inimigos e civis modulares
- **Corpos-base:** 4–6 variantes MPFB2 (magro, médio, forte, gordo, alto, baixo; 2 femininas para civis) com o mesmo
  esqueleto.
- **Morph targets de variação** exportados em cada corpo-base: 6–10 de rosto (largura, nariz, queixo, olhos, mandíbula,
  idade) e 3–4 de corpo (peso, músculo, barriga). Pesos aleatórios por instância (seed do spawn) → rostos e portes
  diferentes sem novos arquivos.
- **Roupas:** cascas (§4) — camisetas, regatas, camisas sociais, moletons, jaquetas de couro, coletes táticos, calças
  jeans/cargo/social, tênis/coturnos; civis: social, terno, uniforme de segurança, crachá.
- **Cabelo/barba/bigode:** biblioteca de 10–15 calotas/cascas; **acessórios:** boné, touca, balaclava, óculos, corrente,
  relógio, bandana; **tatuagens** como decalques no atlas.
- **Tint:** paletas por facção/arquétipo em `data/enemies/variation.json` (máscaras de cor no atlas).
- **Atlas único** de roupas/acessórios (2048² High, 1024² Medium/Low) → mesclagem em runtime em 1–2 `SkinnedMesh`.
- **LODs:** LOD0 ~10–12k tris, LOD1 ~5k, **LOD corpo-baked ~2k** (para corpos T3).
- **Peças de desmembramento** pré-separadas por corpo-base (cabeça, braço, antebraço, coxa, canela ×2) com tampas.

## 9. Animação
### 9.1 Fontes (100% automático primeiro; Mixamo como reforço)
| Fonte | Licença | Login | Cobre |
|---|---|---|---|
| **Quaternius Universal Animation Library 1 e 2** | CC0 | não | locomoção completa, socos básicos, reações, mortes, rolamento, idle — **inventariar** o que existe |
| **CMU Motion Capture** (BVH cgspeed) | uso comercial ok, sem revender os dados; crédito recomendado | não | locomoção natural, levantar do chão (de bruços/de costas), alguns sujeitos com luta/boxe — procurar no índice por *boxing, punch, kick, fight, stumble* |
| **Mixamo** (opcional, usuário baixa) | uso em jogo ok; não redistribuir avulso | **sim (usuário)** | a maior variedade de golpes, combos, reações, finalizações, criatura ("Mutant…"), civis com medo |
| **Autoria por script** (keyframes em dados) | nossa | — | finalizações, transformação, corrida quadrúpede, devorar, golpes únicos dos bosses, poses de reféns |
| **Procedural em runtime** | nossa | — | olhar, inclinação, recuo aditivo, IK, respiração, cobra do Clóvis |

### 9.2 Autoria por script (para o que não existe em bibliotecas)
- Poses-chave definidas em JSON (rotações por osso em tempos-chave + curvas de easing) → script Blender gera o clip.
- **Ferramenta de contact sheet:** renderiza cada pose-chave e frames intermediários de 2 ângulos numa grade PNG → o
  agente **olha** a imagem, corrige poses e repete. Sem isso, autoria de animação por código fica cega.
- **Corrida quadrúpede do lobo:** ciclo de galope (4 tempos) com mãos tocando o chão, coluna ondulando, cabeça estável;
  autorado por pose-chave + IK de mãos/pés no chão; velocidade da raiz sincronizada com a cadência. Fallback: corrida
  bípede curvada com braços baixos.

### 9.3 Polimento automático (todas as fontes)
`tools/blender/anim_polish.py`: corte, *loop matching* (casa primeiro/último frame), detecção de contato do pé + travamento
(remove deslize), extração de root motion para o osso `root`, **retime de golpes** (antecipação mais curta e *hold* no
impacto: golpe fica mais "seco"), espelhamento (variantes esquerda/direita grátis), redução de keyframes, export com nomes
canônicos `ANIM_<ator>_<ação>_<variante>`.

### 9.4 Lista mínima "10 excelentes" por ator (vertical slice)
Márcio: idle de combate, andar, correr, sprint, esquiva (rolamento curto), 4 golpes leves encadeáveis, 2 pesados, chute,
reação a dano, 1 finalização. Inimigo thug: idle, andar, correr, circular (strafe), 2 ataques, reação leve, stagger,
knockdown + levantar, morte. Depois expandir (ver `DEVELOPMENT_ROADMAP.md`).

## 10. Níveis (andares)
1. **Planta em dados:** `data/levels/floorN/layout.json` — salas (retângulos/polígonos com altura), portas, janelas,
   tipo de sala (lobby, recepção, segurança, open office, reunião, cafeteria, técnico/servidor, VIP, banheiro, depósito,
   escada, elevador, auditório), regras de mobília por tipo, pontos de spawn, arenas, barricadas, reféns, segredos.
2. **Gerador Blender** (`tools/blender/build_floor.py`): paredes/pisos/tetos com rodapé e frisos, peças modulares
   (portas, divisórias de vidro, colunas, forro com luminárias, escadas, elevadores, balcões), mobília posicionada por
   regras (fileiras de mesas com cadeiras/monitores, mesa de reunião, balcão de café…), materiais PBR (texturas CC0 de
   ambientCG/Poly Haven baixadas sem login).
3. **Overrides** em `data/levels/floorN/overrides.json` para ajustes manuais (o gerador nunca sobrescreve overrides).
4. **Luz baked:** UV2 automática + **bake Cycles na GPU** (CUDA/OptiX da RTX 3050, denoise OIDN) de lightmap por andar
   (atlas 2048–4096) para tudo que é estático; objetos dinâmicos/destrutíveis recebem luz por **light probes**
   (harmônicos esféricos baked em grade) + 1–3 luzes dinâmicas por sala.
5. **Export:** geometria estática mesclada por material e **fatiada por sala** (para culling por zona), colisão
   simplificada (caixas da planta), navmesh (recast, script Node) e manifesto.
6. **Validação:** capturas automáticas de câmeras pré-definidas por sala (`tools/verify/capture.ts`) para revisão visual.

Andares (resumo; detalhe em `docs/GAME_DESIGN.md`): **1 — Térreo** (átrio monumental com mezanino, recepção, catracas de
segurança, cafeteria, sala de correspondência, banheiros, depósito, **auditório = arena do Clóvis**); **2 — Escritórios**
(open office, salas de reunião de vidro, copa, sala de servidores/técnica, RH, arquivo, sala de descanso); **3 — Executivo**
(lounge VIP, escritórios de diretoria, sala do conselho, adega/bar, terraço/heliponto para o final).

## 11. Props, armas e fratura
- Props modelados por script (mesa, cadeira de escritório, monitor, gabinete, bebedouro, vaso com planta, divisória,
  sofá, estante, extintor, impressora, máquina de café, lixeira, placas) com chanfros, bons materiais e AO baked; LOD por
  *decimate*. Modelos CC0 do Poly Haven quando houver equivalente melhor.
- **Fratura pré-calculada:** script Voronoi no Blender gera peças de quebra por prop destrutível (6–20 peças),
  exportadas no mesmo GLB (ocultas).
- **Armas:** porrete, chave inglesa, bastão de baseball, guitarra, faca, facão (+ cano, extintor, cadeira como arma
  pesada de 1 uso). Cada uma com estado intacto, **danificado** (deformada/rachada) e peças de quebra.

## 12. Áudio
- **SFX:** Kenney (CC0), OpenGameArt (filtrar CC0/CC-BY), Sonniss GDC bundles (royalty-free, uso em jogo; não redistribuir
  como biblioteca) + síntese própria (whoosh, Karplus-Strong para cordas da guitarra, *sub-hit*). Processo: corte,
  `loudnorm`, variações, export **AAC `.m4a`** (toca em todos os navegadores; MP3 como fallback).
- **Voz da transformação:** `assets-src/audio/sfx_transform_fala_lobinho.mp3` (1,25 s, 48 kHz estéreo) → normalizado, sem
  cortar o fim; toca no bus `voice` com ducking forte da música.
- **Música (metal/rock):** faixas CC0/CC-BY de OpenGameArt (e similares sem login), com BPM e pontos de loop medidos por
  script; organizadas por estado (explore/combat/arena/boss/wolf). `docs/MUSIC_PROMPTS.md` (a criar) terá prompts prontos
  caso o usuário queira gerar faixas melhores no Suno depois — **substituição sem mudar código** (só `data/audio/music.json`).
- Tudo com origem e licença em `CREDITS.md`.

## 13. TVs, monitores e painéis
Conteúdo procedural em `CanvasTexture` (atualiza a 10–15 fps): telejornal fictício com letreiro "PRÉDIO SITIADO",
gráficos de bolsa, slides corporativos da empresa fictícia, tela azul, **CCTV** (render em baixa resolução de uma câmera
do próprio nível, só High/Ultra). Pasta opcional `public/videos/*.mp4` (substituível) → `VideoTexture` se existir.

## 14. Otimização e manifesto
- glTF-Transform: `dedup`, `prune`, `weld`, `resize` por classe, **KTX2** (UASTC para rosto/normal maps; ETC1S para o
  resto), **Meshopt**. Fallback WebP se `toktx` indisponível (registrar em `DECISIONS.md`).
- Conjuntos de textura por preset para personagens (2048/1024/512) escolhidos no carregamento.
- `public/assets/manifest.json`: `id, path, bytes, tris, texturas, fonteFiles, sourceHash, generator, generatorVersion,
  classeDeOrçamento`. `npm run assets:check` recalcula hashes e **falha** se fonte mudou sem regenerar, ou se orçamento
  estourou.

### Orçamento por classe (alvo)
| Classe | Tris LOD0 | Texturas (High) | Download (KTX2+Meshopt) |
|---|---|---|---|
| Márcio (+ morphs do lobo, shells) | ≤ 35k | cabeça 2048², corpo/roupa 2048² | ≤ 8 MB |
| Boss | ≤ 30k | 2048² + 1024² | ≤ 6 MB |
| Corpo-base de inimigo/civil (com morphs) | ≤ 12k | atlas compartilhado 2048² | ≤ 2,5 MB cada |
| Prop comum | ≤ 3k (LOD1 ≤ 1k) | atlas de props | — |
| Andar completo (estático + lightmap + colisão + navmesh) | ≤ 400k visíveis por vez | lightmap ≤ 4096² | ≤ 25 MB |
| Animações (todas, compartilhadas) | — | — | ≤ 10 MB |
| Áudio (SFX + música) | — | — | ≤ 30 MB |
| **Jogo inteiro** | | | **≤ 150 MB** (até o menu ≤ 15 MB) |
