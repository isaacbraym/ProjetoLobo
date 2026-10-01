# GAME_DESIGN — "Márcio" (Projeto Lobo)

Data: 2026-09-30 · Status: **PROPOSTO** · Números são **valores iniciais de tuning**; a fonte final é `data/**/*.json`.
Intenção original: `docs/ORIGINAL_BRIEF.md`.

## 1. Pitch
Filme de ação exagerado, anti-herói brutal. Márcio — tiozão parrudo de polo verde-oliva, jeans e barba grisalha — entra
no **Edifício Vértice** (nome provisório), tomado por uma facção criminosa com reféns. Ele sobe três andares quebrando
tudo e todos. Quando a raiva enche, vira o **Lobisomem Márcio** ("FALA LOBINHO!") e transforma a sala em carnificina.

Tom: brutal e engraçado ao mesmo tempo. Reféns comemoram… até Márcio acertar um deles.

## 2. Loop
Explorar a sala → perceber ameaça (reféns vigiados, criminosos patrulhando) → briga (pequena ou arena trancada) →
reféns reagem → saquear armas improvisadas/itens/segredos → avançar → arena principal → boss → elevador → próximo andar.
Sessão de um andar: 20–35 min. Jogo completo: ~1h30–2h.

## 3. Controles
| Ação | Teclado/mouse | Gamepad (padrão Xbox) | Toque |
|---|---|---|---|
| Mover / câmera | WASD / mouse (pointer lock) | analógico E / D | analógico flutuante esquerdo / arrastar à direita |
| Correr | Shift (segurar) | L3 ou analógico no máximo | analógico no máximo |
| Ataque leve | Clique esquerdo | X | botão **Leve** |
| Ataque pesado (segurar = carregado) | Clique direito | Y | botão **Pesado** |
| Chute | F | B | botão **Chute** |
| Esquiva / contra (no tempo do telegrafado) | Espaço | A | botão **Esquiva** |
| Agarrar / interagir / pegar arma (contextual) | E | RB | botão **contextual** (ícone muda) |
| Largar/arremessar arma | Q | LB | segurar o contextual |
| Lobisomem (barra cheia) | R | LT+RT | botão **Lobo** (pulsa quando cheio) |
| Finalização (prompt sobre o inimigo) | E | RB | contextual |
| Pausa | Esc | Start | ícone ‖ |

## 4. Combate do Márcio (valores iniciais)
- **Leve:** cadeia de até 4 (jab, cruzado, gancho, finalizador da cadeia: cabeçada/cotovelo/uppercut — variante por
  contexto). Dano 8–12, hitstop 50–70 ms, startup 90–120 ms.
- **Pesado:** 22–30 de dano, quebra guarda, poise alto, hitstop 90–120 ms; **carregado** (≥ 0,5 s): soco giratório em
  área/empurrão que derruba (35).
- **Chute:** chute frontal que empurra (afasta/derruba em cadeia), chute lateral, pisão em inimigo no chão.
- **Combos-assinatura** (sem decorar: surgem naturalmente): `L,L,H` = sequência + golpe forte; `L,L,K` = chute que lança;
  `H` em inimigo atordoado = finalização rápida; `K` após esquiva = voadora.
- **Free-flow:** cada golpe escolhe o alvo pela direção do analógico; Márcio avança até 4–5 m com warp.
- **Esquiva:** 0,35 s, i-frames 0,22 s, cancelável em ataque. **Esquiva perfeita** no telegrafado → slow-mo 0,3 s +
  contra-golpe contextual (gancho no queixo, joelhada, arremesso).
- **Agarrão:** pegar inimigo atordoado ou leve → socos curtos (3), **arremesso** direcional (contra parede = dano extra;
  contra mesa = quebra a mesa; contra inimigos = derruba em cadeia), ou finalização.
- **Finalizações** (≥ 6 humanas no M4, 3–4 por arquétipo): ex. bater a cabeça na mesa/parede, quebrar o braço e
  nocautear, arremessar por cima do ombro contra o chão, joelhada dupla no rosto, enforcamento com estrangulamento rápido,
  com arma (bastão no joelho + na cabeça; guitarra quebrada na cabeça). Duração 0,8–1,4 s, câmera curta, slow-mo leve.
- **Vida do Márcio:** 100. 3 vidas. Checkpoint no início de cada arena/sala grande. Cura: comida da cafeteria, kits de
  primeiros socorros (segredos), devorar (lobo).

## 5. Barra do Lobisomem (valores iniciais, `data/werewolf.json`)
Ganho (0–100):
| Evento | Ganho |
|---|---|
| Dano causado | +0,35 por ponto, × multiplicador de combo (1,0 → 2,0 aos 20 hits) |
| Eliminação | +4 (+2 por tier do inimigo) |
| Finalização | +12 |
| Esquiva perfeita / contra | +5 |
| Dano recebido | +0,25 por ponto (raiva; pequeno para não premiar apanhar) |
| Objeto destruído | +1 |
Sem ganho passivo; **sem perda** fora de combate (o jogador escolhe quando gastar). Combo reseta após 2,5 s sem acertar.

**Transformação (≈ 2,0 s, invulnerável, inimigos recuam):**
| t (s) | Evento |
|---|---|
| 0,00 | input; corte para **close frontal do rosto do Márcio** (câmera cinematográfica); tempo do mundo 0,25× |
| 0,05 | **"FALA LOBINHO"** (1,25 s) no bus de voz; música abafada −18 dB (ducking) + filtro passa-baixa |
| 0,05–1,30 | `wolfAmount` 0→1: olhos âmbar, orelhas e nariz, presas, pelo crescendo, músculos/braços crescendo, garras, roupa rasgando; luz de borda quente + partículas; tremor leve |
| 1,30–1,60 | câmera abre para corpo inteiro; **rugido** + onda de choque que derruba inimigos num raio de 4 m |
| 1,60–2,00 | música volta com a **camada lobo** (mais pesada); controle devolvido |

**Como lobo:** vida extra temporária = +100 (escudo de vida que absorve dano primeiro), dano ×2,5, velocidade ×1,4,
resistência a stagger, golpes próprios (patadas em X, investida, salto esmagador, arremesso de inimigo longe, agarrão
com mordida), **desmembramento** em finalizações e golpes fortes em inimigo com HP baixo, quebra de props em 1 golpe e por
impacto ao correr. **Devorar:** inimigo atordoado/no chão → 1,2 s (mordida no pescoço, sangue, som) → cura 25 da vida
do Márcio e +3 s de lobo. **Corrida de quatro:** sprint segurado por > 0,4 s → transição para galope, velocidade ×2,2,
FOV +5°, blur radial leve, poeira, câmera mais baixa e atrás; atropela inimigos e props.

**Duração:** 25 s base; +1,5 s por eliminação; teto 40 s; barra visível drenando. Retorno: 0,8 s (vapor, pelos caindo,
Márcio ofegante; roupas **continuam rasgadas até o fim do andar** — detalhe de humor, configurável).

## 6. Inimigos (`data/enemies/archetypes.json`)
| Arquétipo | HP | Poise | Vel. | Comportamento | Visual |
|---|---|---|---|---|---|
| **Thug** (T1) | 60 | 20 | média | 2 ataques simples, foge pouco | camiseta/regata, boné |
| **Fast** (T1) | 45 | 10 | alta | combos rápidos de 2–3 golpes, reposiciona muito, provoca | moletom, magro |
| **Heavy** (T2) | 180 | 80 | baixa | golpes lentos e fortes, investida, imune a leve sem quebrar poise | gordo/forte, colete |
| **Grappler** (T2) | 110 | 40 | média | tenta agarrar (QTE de esquiva/apertar leve rápido para escapar) | regata, tatuagens |
| **Armed** (T1–T2) | 70 | 25 | média | usa arma improvisada (porrete, faca, cano), mantém 2,5 m, larga a arma ao apanhar | jaqueta |
| **Thrower** (T1) | 55 | 15 | média | arremessa garrafas/cadeiras/extintores de distância | jaqueta, bandana |
| **Shield** (T2) | 100 | 60 | baixa | usa porta/cadeira/escudo antimotim; precisa de pesado, chute ou agarrão por trás | colete tático |
| **Elite** (T3) | 150 | 50 | alta | esquiva, contra-ataca, combos de 4, coordena (dá ordens), finta | terno escuro, óculos |
Barra sobre a cabeça com 1–3 marcas de tier e cor por arquétipo; nome só para elites e bosses.

## 7. Dificuldade (`data/difficulty.json`)
| Parâmetro | Fácil | Normal | Difícil |
|---|---|---|---|
| Tokens de ataque simultâneos | 1 | 2 | 3 |
| Telegrafia antes do golpe | 650 ms | 450 ms | 300 ms |
| Cooldown entre ataques do mesmo inimigo | 2,2 s | 1,6 s | 1,1 s |
| Dano dos inimigos | ×0,6 | ×1,0 | ×1,4 |
| Tamanho das ondas | ×0,8 | ×1,0 | ×1,25 |
| % de Elite/Heavy nas ondas | baixa | média | alta |
| Chance de esquiva do Elite | 15% | 30% | 50% |
| HP dos inimigos | ×0,9 | ×1,0 | ×1,15 |
| Ganho da barra do lobo | ×1,3 | ×1,0 | ×0,85 |

## 8. Reféns e civis (`data/civilians.json`)
Estados: **Cativo** (ajoelhado, mãos na cabeça, encolhido, agrupado, vigiado) → **Esperança** (Márcio luta perto:
olham, torcem baixinho, gestos) → **Alívio/fuga** (sala limpa: agradecem e fogem para a saída segura — somem só ao passar
pela porta de saída, nunca na frente do jogador) → se Márcio acerta civis: **medo da zona** sobe → **Pânico** (correm,
escondem atrás de mesas, cobrem a cabeça, imploram quando encurralados, gritam, evitam Márcio). Medo decai lentamente.
Sem penalidade de jogo. Tipos: funcionários, visitantes, seguranças rendidos, pessoas escondidas em banheiros/depósitos.

## 9. Armas improvisadas (`data/weapons.json`)
| Arma | Dano | Alcance | Peso (vel. de golpe) | Durabilidade (golpes) | Som | Especial |
|---|---|---|---|---|---|---|
| Porrete | 16 | médio | médio | 14 | madeira seca | — |
| Chave inglesa | 18 | curto | médio | 18 | metálico agudo | atordoa |
| Bastão de baseball | 20 | longo | médio | 12 | impacto seco "toc" | home run (pesado lança longe) |
| Guitarra | 22 | longo | pesado | 6 | impacto + cordas vibrando; quebra com madeira estalando | último golpe quebra na cabeça (finalização) |
| Faca | 14 + sangramento | curto | leve | 20 | corte | golpes rápidos |
| Facão | 24 | médio | médio | 10 | corte pesado | pode desmembrar (raro) humano |
| Cano / extintor / cadeira | 18–30 | variado | pesado | 3–8 | metal/plástico | extintor solta nuvem que atordoa |
Estados: intacta → **danificada** (malha deformada/rachada, som mais "sujo") → quebra (peças voam). Lobisomem não usa armas.

## 10. Destruição (`data/props/materials.json`)
plástico (HP baixo) < vidro (quebra fácil, estilhaços) < madeira < MDF/divisória < metal leve < metal estrutural
(indestrutível). Ex.: mesa de madeira = 3–5 golpes do humano, 1 do lobo; monitor = 1–2; divisória de vidro = 1–2 (lobo
atravessa correndo); bebedouro = 2 (água no chão); porta comum = 6 (lobo: 1).

## 11. Andares e bosses
### Andar 1 — Térreo / Átrio
Átrio monumental (pé-direito duplo, mezanino de vidro, painéis LED, escada rolante parada), recepção, catracas da
segurança (primeira briga), cafeteria (cura e armas), correspondência, banheiros (refém escondido = segredo), depósito
(guitarra de um músico visitante = segredo), corredor de serviço (rota alternativa), **auditório** (arena final).
Arenas: catracas (portas de vidro baixam), cafeteria (mesas viradas como barricada), auditório (grades).

**Boss 1 — Clóvis B.** Careca, sorriso arregalado permanente, blazer branco, camiseta listrada, **bengala**.
Personalidade: showman insano, ri e provoca, nunca para de sorrir.
- **Intro (≈ 4 s, pulável):** holofote no palco do auditório, Clóvis girando a bengala, close no sorriso, nome na tela.
- **Fase 1 (100–60%):** combos de bengala (varrida baixa, estocada, giro), **gancho da bengala** que puxa Márcio pelo
  pescoço (escapar com esquiva no tempo), invoca 2–3 thugs por vez.
- **Fase 2 (60–25%):** **a perna direita vira cobra** — botes de longo alcance, chicotada em área, cobra agarra e
  arremessa; Clóvis fica mais rápido e ri mais alto.
- **Fase 3 (< 25%):** frenesi — alterna bengala e cobra em combos longos, destrói o cenário do palco; janelas de
  contra-ataque maiores após cada combo (justo).
- **Finalização especial** do boss (humano e lobo têm versões diferentes). Morte → grade abre, elevador liberado.
- Música: faixa de boss com variação "circense/insana".

### Andar 2 — Escritórios
Open office enorme (fileiras de mesas destrutíveis), salas de reunião de vidro, copa, sala de servidores (luz fria,
fumaça), RH e arquivo (labirinto curto de estantes), sala de descanso (fliperama/sinuca = armas), duto de ventilação
(rota alternativa curta). **Boss 2: a definir** — placeholder data-driven "Brutamontes" (Heavy grande com martelo de
demolição) até o usuário definir.

### Andar 3 — Executivo
Lounge VIP, escritórios de diretoria com vista, sala do conselho, adega/bar, cofre, terraço/heliponto (final). **Boss 3:
a definir** — placeholder "Chefão" (Elite com duas facas e capangas) até o usuário definir. Final: helicóptero chegando,
créditos com cenas engraçadas; desbloqueia a skin **Márcio Herói**.

### Segredos e itens (por andar)
2–4 segredos: kit de vida, arma rara, refém escondido, sala com easter egg (ex.: sala de TI com memes nas telas).

## 12. HUD
Canto superior esquerdo: vida (barra + 3 ícones de vida) e barra do lobo (pulsa quando cheia). Inferior direito: arma +
durabilidade. Centro-baixo: prompt contextual. Sobre inimigos: barra pequena só em combate. Contador de combo discreto à
direita quando ≥ 5 hits. Nada mais.

## 13. Créditos e fluxo
Gate de senha → título com Márcio em idle de combate e música → menu → jogo → game over (continuar do checkpoint, com
vidas zeradas volta ao início do andar) → final → créditos (incluindo `CREDITS.md`).
