import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Refrão",
    short_name: "Refrão",
    description: "Acompanhe a letra enquanto você ouve música no YouTube.",
    version: "0.1.0",
    permissions: ["storage"],
    host_permissions: ["https://www.youtube.com/*", "https://lrclib.net/*"],
    action: {
      default_title: "Abrir Refrão",
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },
  },
});
