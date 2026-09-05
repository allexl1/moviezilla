import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

import tmdbHandler from './api/tmdb.js'
import tmdbImageHandler from './api/tmdb-image.js'
import letterboxdHandler from './api/letterboxd/[username].js'

// Serves the Vercel-style api/ handlers under `npm run dev` so the app
// behaves the same locally as in production (catalog, images, Letterboxd).
// Secrets stay in .env.local (gitignored); without TMDB_API_KEY the client
// keeps its existing graceful fallbacks.
function devApi() {
  return {
    name: 'moviezilla-dev-api',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '')
      for (const [k, v] of Object.entries(env)) {
        if (!(k in process.env)) process.env[k] = v
      }

      const apiMiddleware = (req, res, next) => {
        const url = new URL(req.url, 'http://localhost')
        const pathname = url.pathname.replace(/\/+$/, '') || '/'
        const query = Object.fromEntries(url.searchParams.entries())

        // NOTE: connect strips the '/api' route prefix from req.url before
        // invoking this middleware, so match the stripped path here.
        let handler = null
        if (pathname === '/tmdb') handler = tmdbHandler
        else if (pathname === '/tmdb-image') handler = tmdbImageHandler
        else if (pathname.startsWith('/letterboxd/')) {
          handler = letterboxdHandler
          query.username = decodeURIComponent(pathname.slice('/letterboxd/'.length))
        } else {
          return next()
        }

        const resShim = {
          status(code) {
            res.statusCode = code
            return resShim
          },
          setHeader: (k, v) => res.setHeader(k, v),
          json(obj) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(obj))
          },
          send(body) {
            res.end(body)
          },
        }

        Promise.resolve(handler({ query }, resShim)).catch((err) => {
          console.error('[dev-api]', pathname, err)
          if (!res.writableEnded) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Dev API handler failed' }))
          }
        })
      }

      // Prepend (not append): vite's transform middleware resolves extensionless
      // /api/* URLs to the api/*.js source files, so an appended middleware
      // would never see the request.
      const middlewares = server.middlewares
      if (Array.isArray(middlewares.stack)) {
        // NOTE: no trailing slash — connect skips layers where the char
        // after the route is not '/' or '.'.
        middlewares.stack.unshift({ route: '/api', handle: apiMiddleware })
      } else {
        middlewares.use('/api/', apiMiddleware)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devApi()],
})
