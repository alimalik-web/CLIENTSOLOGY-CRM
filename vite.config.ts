import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

function gracefulHmrPlugin(): Plugin {
  let isHmrDisabled = false;
  return {
    name: 'graceful-hmr-client',
    enforce: 'post',
    configResolved(resolved) {
      isHmrDisabled =
        resolved.server.hmr === false ||
        resolved.server.ws === false ||
        process.env.DISABLE_HMR === 'true';
    },
    transform(code, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/vite/dist/client/client.mjs')) {
        return null;
      }

      let next = code;
      if (isHmrDisabled) {
        next = next.replace(
          'transport.connect(createHMRHandler(handleMessage));',
          '/* HMR WebSocket connection suppressed */'
        );
        return {code: next, map: null};
      }

      next = next
        .replace(
          /console\.error\(`\[vite\] failed to connect to websocket\.\s*\n[\s\S]*?`\);/,
          'console.debug("[vite] HMR websocket unavailable in this environment.");'
        )
        .replace(
          /console\.error\(`\[vite\] failed to connect to websocket \(\$\{e\}\)\. `\);\s*throw e;/,
          'console.debug("[vite] HMR websocket unavailable:", e); return;'
        )
        .replace(
          'transport.connect(createHMRHandler(handleMessage));',
          'Promise.resolve(transport.connect(createHMRHandler(handleMessage))).catch(() => {});'
        );

      return {code: next, map: null};
    },
  };
}

export default defineConfig(() => {
  const hmrDisabled = process.env.DISABLE_HMR === 'true';
  return {
    plugins: [react(), tailwindcss(), gracefulHmrPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: !hmrDisabled,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: hmrDisabled ? null : {},
    },
  };
});
