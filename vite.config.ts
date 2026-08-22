import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // API 요청은 같은 포트의 Express 서버(server.ts)가 처리하므로 별도 프록시 없이
    // Vite를 Express 미들웨어 모드로 붙여서 씀 (server.ts 참고).
  },
});
