import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import wails from "@wailsio/runtime/plugins/vite";
import { resolve } from "path";

const bindingsRoot = resolve(__dirname, "bindings");

function wailsCustomJsFallback() {
  return {
    name: "wails-custom-js-fallback",
    configureServer(server) {
      server.middlewares.use("/wails/custom.js", (req, res) => {
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
export default defineConfig({
  plugins: [vue(), wailsCustomJsFallback(), wails(bindingsRoot)],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
