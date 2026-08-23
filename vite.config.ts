import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "unseal-mark.svg"],
      manifest: {
        name: "unseal",
        short_name: "unseal",
        description: "create an unprotected copy of a known-password PDF on this device.",
        theme_color: "#090a0c",
        background_color: "#090a0c",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,wasm,png,ico}"],
      },
    }),
  ],
});
