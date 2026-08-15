import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import vue from "@vitejs/plugin-vue";
import wails from "@wailsio/runtime/plugins/vite";
import { resolve } from "path";

const bindingsRoot = resolve(__dirname, "bindings");

// Wails 模板在 window 上暴露 `/wails/custom.js` 供自定义脚本注入。
// 本应用不使用该钩子,提供空响应避免 dev server 404。
function wailsCustomJsFallback(): Plugin {
  return {
    name: "wails-custom-js-fallback",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/wails/custom.js", (req: IncomingMessage, res: ServerResponse) => {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        res.end("");
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [vue(), wailsCustomJsFallback(), wails(bindingsRoot)],
  // 生产构建剥离调试日志 (保留 console.error/warn 作为运行时错误上报)。
  // 源码层已无 log/debug/info, 此为构建期兜底, 防止后续误加回调试输出。
  esbuild: mode === 'production'
    ? { pure: ['console.log', 'console.debug', 'console.info'] }
    : undefined,
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
}));
