import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Vendor libraries in their own chunks: they change rarely, so browsers keep them cached across app deploys,
 * and they download in parallel with the app code. */
function vendorChunk(id: string) {
  if (!id.includes('node_modules')) return undefined;
  if (/node_modules\/(recharts|d3-[^/]+|victory-vendor|internmap|decimal\.js-light|eventemitter3|lodash|react-smooth|recharts-scale|tiny-invariant|clsx|immer|reselect|@reduxjs|redux|react-redux|use-sync-external-store|es-toolkit)\//.test(id)) return 'charts';
  if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
  if (/node_modules\/lucide-react\//.test(id)) return 'icons';
  if (/node_modules\/papaparse\//.test(id)) return 'csv';
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { output: { manualChunks: vendorChunk } } },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
