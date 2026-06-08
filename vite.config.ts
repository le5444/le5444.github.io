import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { VitePWA } from "vite-plugin-pwa";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 双构建：
//  - `vite build`            → 单文件 HTML（dist/index.html，可双击运行）
//  - `vite build --mode pwa` → PWA 多文件 + manifest + service worker（dist-pwa/，可装到手机主屏离线运行）
export default defineConfig(({ mode }) => {
  const isPwa = mode === "pwa";

  return {
    plugins: [
      react(),
      tailwindcss(),
      // 单文件模式才启用 inline；PWA 模式需要保留独立资源以便 sw 缓存
      ...(isPwa
        ? [
            VitePWA({
              registerType: "autoUpdate",
              includeAssets: ["icon.svg", "icon-192.png", "icon-512.png", "icon-512-maskable.png"],
              manifest: {
                name: "织梦写作台 / Zhimeng Writing Agent",
                short_name: "织梦 Agent",
                description: "面向中文长篇小说创作的开源 AI Agent 工作台：写作、设定、Skills、记忆、审批和本地 Bridge。",
                theme_color: "#0f172a",
                background_color: "#0f172a",
                display: "standalone",
                orientation: "any",
                lang: "zh-CN",
                start_url: ".",
                scope: ".",
                icons: [
                  { src: "icon-192.png", sizes: "192x192", type: "image/png" },
                  { src: "icon-512.png", sizes: "512x512", type: "image/png" },
                  { src: "icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
                  { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
                ],
              },
              workbox: {
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
                navigateFallback: "index.html",
                cleanupOutdatedCaches: true,
              },
            }),
          ]
        : [viteSingleFile()]),
    ],
    build: {
      outDir: isPwa ? "dist-pwa" : "dist",
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
  };
});
