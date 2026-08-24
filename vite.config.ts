import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "unseal",
        short_name: "unseal",
        description: "Unseal your password protected PDF. Create a copy that opens without a password. Your PDF never leaves this device.",
        theme_color: "#08090a",
        background_color: "#08090a",
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
        globPatterns: ["**/*.{js,css,html,svg,wasm,png,ico,woff2}"],
      },
    }),
  ],
});
