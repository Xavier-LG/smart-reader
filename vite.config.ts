import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const warmupClientFiles = [
    './src/main.tsx',
    './src/App.tsx',
    './src/index.css',
    './src/components/layout/Sidebar.tsx',
    './src/components/modals/Uploader.tsx',
    './src/components/modals/NoticeModal.tsx',
    './src/components/modals/SettingsModal.tsx',
  ];

  return {
    cacheDir: 'node_modules/.vite',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: {
      entries: warmupClientFiles,
      include: [
        'react',
        'react/jsx-runtime',
        'react-dom/client',
        'lucide-react',
        'zustand',
        'motion/react',
        'clsx',
        'tailwind-merge',
        'nanoid',
      ],
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      warmup: {
        clientFiles: warmupClientFiles,
      },
    },
  };
});
