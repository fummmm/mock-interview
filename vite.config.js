import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // 프로덕션 빌드에서 console.log/warn 제거
        banner: `if(typeof window!=='undefined'&&!window.__DEV__){console.log=()=>{};console.warn=()=>{};}`,
      },
    },
  },
})
