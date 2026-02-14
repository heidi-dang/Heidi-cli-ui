import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, '.', '');
  const SERVER_BASE = env.HEIDI_SERVER_BASE || env.VITE_HEIDI_SERVER_BASE || 'http://127.0.0.1:7777';

  return {
    plugins: [react()],
    server: {
      port: 3002,
      strictPort: true,
      proxy: {
        '/api': {
          target: SERVER_BASE,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  };
});