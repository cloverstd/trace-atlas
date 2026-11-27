import { readFile } from 'node:fs/promises';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { fileURLToPath, URL } from 'node:url';

const earlyHints: Plugin = {
  name: 'early-hints',
  apply: 'build',
  applyToEnvironment: (env) => env.name === 'client',
  enforce: 'post',
  async generateBundle(_, bundle) {
    const index = fileURLToPath(new URL('./index.html', import.meta.url));
    const entry = Object.values(bundle).find(
      (file) => file.type === 'chunk' && file.facadeModuleId === index,
    );
    if (entry?.type !== 'chunk') this.error('Missing index.html entry for Early Hints');

    const links = [...(entry.viteMetadata?.importedCss ?? [])].map(
      (css) => `</${css}>; rel=preload; as=style; crossorigin`,
    );
    links.push(`</${entry.fileName}>; rel=preload; as=script; crossorigin`);
    const rules = ['/', '/admin', '/admin/*'].map((path) => `${path}\n  Link: ${links.join(', ')}`);
    // Exact paths keep SPA fallback HTML out of the immutable browser cache.
    const cacheRules = Object.keys(bundle)
      .filter((file) => /^assets\/.+-[\w-]{8}\.(?:css|js)$/.test(file))
      .map((file) => `/${file}\n  Cache-Control: public, max-age=31536000, immutable`);
    const headers = await readFile(new URL('./public/_headers', import.meta.url), 'utf8');
    this.emitFile({
      type: 'asset',
      fileName: '_headers',
      source: [headers, ...rules, ...cacheRules, ''].join('\n'),
    });
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(), earlyHints],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173 },
});
