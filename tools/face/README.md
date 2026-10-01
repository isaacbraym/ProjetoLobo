# tools/face — rosto "Face Photo" estilo WWE 2K (ASSET_PIPELINE §3)

Tudo automático e chamado pelo build do personagem (`tools/blender/build_character.py` quando a receita tem `face`):

| Arquivo | Etapa | O que faz |
|---|---|---|
| `analyze.ts` + `landmarks.html` | F2 / F11 | MediaPipe (Face Landmarker 478 pontos + Selfie Multiclass) numa página local aberta pelo Chromium headless. Serve tudo do disco por `page.route` (sem rede). |
| `texture.ts` | F1 / F7 / F9 | Textura do jogo **sem extensão** na resolução nativa da foto: RGB = foto com delighting leve na pele e fundo/roupa preenchidos (push-pull); A = máscara de pelo (cabelo pela segmentação, refinado pela cor na borda; barba/bigode pela cor na metade de baixo do rosto). Escreve também `*_valid.png` (pessoa × fundo) e cores médias (pele, cabelo, barba). |
| `../blender/face_fit.py` | F3–F6 + F11 | Render da cabeça-base → MediaPipe no render → correspondência por raio da câmera; ajuste por mínimos quadrados com limites dos modificadores faciais do MPFB2 + escolha da distância da câmera (perspectiva da selfie); resíduo por TPS no plano da câmera (shape key); UV `FaceProj` = pixel da foto; renders de conferência (`.agent-tmp/characters/marcio/face_qa_*.png`). |
| `compare.ts` | F11 no jogo | `npm run capture face` → `face_photo.png` (câmera imitando a foto) × foto: erro de landmarks normalizado pela distância interocular + SSIM do recorte + `face_compare.png` (foto \| jogo alinhado \| sobreposição). |
| `viz.ts` | conferência | Pontos + segmentação sobre a imagem. |

Modelos (baixados uma vez para `tools/bin/`, fora do Git, Apache-2.0):
```
curl -L -o tools/bin/face_landmarker.task https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
curl -L -o tools/bin/selfie_multiclass_256x256.tflite https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite
```

Runtime (`src/engine/render/materialLibrary.ts`): pele mistura a foto pela máscara por vértice (`FaceMask`); cascas de
cabelo/barba (`peltPhotoMaterial`) usam cor de vértice R = peso da cor da foto (só de frente), G = alfa de borda ×
recorte geométrico (costeleta, linha da bochecha), B = grisalho do fallback, A = peso do recorte pela foto; `alphaHash`
para borda macia sem MSAA.
