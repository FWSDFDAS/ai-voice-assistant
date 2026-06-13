import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { traeBadgePlugin } from 'vite-plugin-trae-solo-badge';

// https://vite.dev/config/
export default defineConfig({
    build: {
        sourcemap: 'hidden',
    },
    server: {
        proxy: {
            // 本地开发时，将 /api/gemini 请求代理到本地 Node 脚本或直接调用 Gemini API
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true,
            },
        },
    },
    plugins: [
        react({
            babel: {
                plugins: [
                    'react-dev-locator',
                ],
            },
        }),
        traeBadgePlugin({
            variant: 'dark',
            position: 'bottom-right',
            prodOnly: true,
            clickable: true,
            clickUrl: 'https://www.trae.ai/solo?showJoin=1',
            autoTheme: true,
            autoThemeTarget: '#root'
        }),
        tsconfigPaths()
    ],
})
