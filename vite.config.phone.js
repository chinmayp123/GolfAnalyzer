import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// HTTPS + LAN config for using a phone as the Practice-mode camera:
//   npm run dev:phone
// then open https://<your-pc-ip>:5199 on the phone (accept the self-signed
// certificate warning once). Browsers only allow camera access on secure
// origins, so plain http over the LAN won't work.
export default defineConfig({
  plugins: [react(), tailwindcss(), basicSsl()],
  root: ".",
  publicDir: "public",
  server: {
    host: true,
    port: 5199,
  },
});
