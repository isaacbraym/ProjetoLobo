import { defineConfig } from 'vite';

// GitHub Pages serve em /ProjetoLobo/. O dev usa o mesmo base para não haver diferença de caminhos.
export default defineConfig({
  base: '/ProjetoLobo/',
  server: { port: 5180, strictPort: true, host: true },
  preview: { port: 4180, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 0,
  },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
});
