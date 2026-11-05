import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// Vite 配置：启用 Vue3 插件，设置路径别名
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    open: true,
    // 阶梯导学后端（Express, 端口 3001）：前端所有 /api 请求代理到后端，同源免 CORS
    proxy: {
      '/api': 'http://localhost:3001',
      // 多人博弈 WebSocket：/ws 也代理到后端（ws 握手转发）
      '/ws': { target: 'ws://localhost:3001', ws: true }
    }
  }
})
