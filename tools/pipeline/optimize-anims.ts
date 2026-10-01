/**
 * Otimiza o GLB de animações: remove quadros redundantes (resample), descarta o que não é usado e comprime com
 * Meshopt (o runtime já decodifica: GLTFLoader.setMeshoptDecoder). Uso:
 *   npx tsx tools/pipeline/optimize-anims.ts public/assets/anims/humanoid_anims.glb
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { statSync } from 'node:fs';

const file = process.argv[2] ?? 'public/assets/anims/humanoid_anims.glb';
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const before = statSync(file).size;
const doc = await io.read(file);
await doc.transform(resample({ tolerance: 2e-4 }), dedup(), prune({ keepLeaves: true, keepAttributes: true }));
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(file, doc);
const after = statSync(file).size;
const anims = doc.getRoot().listAnimations().length;
console.log(`[optimize-anims] ${file}: ${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB (${anims} animações)`);
