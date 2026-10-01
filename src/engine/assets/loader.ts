import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const BASE = import.meta.env.BASE_URL;

export function assetUrl(path: string): string {
  return BASE + path.replace(/^\//, '');
}

/** Carregador central (glTF + Meshopt + KTX2) com progresso agregado e cache. */
export class Assets {
  private gltf: GLTFLoader;
  private cache = new Map<string, Promise<GLTF>>();
  private progress = new Map<string, number>();
  onProgress?: (fraction: number) => void;

  constructor(renderer: THREE.WebGLRenderer) {
    const ktx2 = new KTX2Loader().setTranscoderPath(assetUrl('basis/')).detectSupport(renderer);
    this.gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2);
  }

  load(path: string): Promise<GLTF> {
    const url = assetUrl(path);
    let p = this.cache.get(url);
    if (!p) {
      this.progress.set(url, 0);
      p = new Promise<GLTF>((resolve, reject) => {
        this.gltf.load(
          url,
          (g) => {
            this.progress.set(url, 1);
            this.emit();
            resolve(g);
          },
          (e) => {
            if (e.total) this.progress.set(url, e.loaded / e.total);
            this.emit();
          },
          (err) => reject(err instanceof Error ? err : new Error(String(err))),
        );
      });
      this.cache.set(url, p);
    }
    return p;
  }

  private emit(): void {
    if (!this.onProgress) return;
    let s = 0;
    for (const v of this.progress.values()) s += v;
    this.onProgress(this.progress.size ? s / this.progress.size : 1);
  }
}
