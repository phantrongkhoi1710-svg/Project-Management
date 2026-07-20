import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

function versionFilePlugin(buildId) {
  return {
    name: 'pm-version-file',
    config() {
      return {
        define: {
          __PM_BUILD_ID__: JSON.stringify(buildId),
        },
      }
    },
    transformIndexHtml(html) {
      const snip = `
    <script>
      (function () {
        var embedded = ${JSON.stringify(buildId)};
        var base = document.querySelector('base')?.href || ${JSON.stringify(process.env.VITE_BASE || '/')};
        if (!base.endsWith('/')) base += '/';
        fetch(base + 'version.json?_=' + Date.now(), { cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (remote) {
            if (!remote || !remote.id || remote.id === embedded) return;
            var u = new URL(location.href);
            if (u.searchParams.get('_b') === remote.id) return;
            u.searchParams.set('_b', remote.id);
            location.replace(u.toString());
          })
          .catch(function () {});
      })();
    </script>`
      return html.replace('</head>', `${snip}\n  </head>`)
    },
    writeBundle(options) {
      const outDir = options.dir || resolve('dist')
      mkdirSync(outDir, { recursive: true })
      writeFileSync(
        resolve(outDir, 'version.json'),
        JSON.stringify({ id: buildId, builtAt: new Date().toISOString() }),
        'utf8'
      )
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] === '/version.json') {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify({ id: buildId, builtAt: new Date().toISOString() }))
          return
        }
        next()
      })
    },
  }
}

const buildId = `${Date.now()}`

// GitHub Pages: set VITE_BASE=/repo-name/ when deploying under a project site
export default defineConfig({
  plugins: [react(), versionFilePlugin(buildId)],
  base: process.env.VITE_BASE || '/',
  server: {
    headers: {
      'Cache-Control': 'no-store',
    },
  },
})
