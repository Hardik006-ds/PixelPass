import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: false },
  // Pre-bundle everything up front so the dev server never reloads the page mid-demo.
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client", "react-router-dom", "qrcode.react", "@noble/hashes/sha2", "@noble/hashes/utils", "@noble/curves/secp256k1"],
  },
  build: { chunkSizeWarningLimit: 1500 },
});
