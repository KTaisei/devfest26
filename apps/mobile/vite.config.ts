import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          ionic: ["@ionic/react", "@ionic/react-router", "ionicons/icons"],
          firebase: ["firebase/app", "firebase/auth"],
        },
      },
    },
  },
});
