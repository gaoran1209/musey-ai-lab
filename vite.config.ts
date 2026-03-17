import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as {
  version?: string;
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version ?? '0.1.0'),
    __BUILD_NUMBER__: JSON.stringify(process.env.GITHUB_RUN_NUMBER ?? ''),
  },
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          ai: ['@google/genai'],
          flow: ['@xyflow/react'],
          ui: ['lucide-react', 'motion'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
    hmr: process.env.DISABLE_HMR !== 'true',
  },
});
