// Custom production server with extended timeout for slow sync API
const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'
const hostname = '0.0.0.0'
const port = parseInt(process.env.PORT || '3210', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = createServer((req, res) => {
    // Extend socket timeout for slow APIs (sync/bootstrap can take 30s+)
    req.socket.setTimeout(120 * 1000)
    res.setTimeout(120 * 1000)

    const parsedUrl = parse(req.url, true)
    handle(req, res, parsedUrl)
  })

  server.timeout = 120 * 1000
  server.keepAliveTimeout = 120 * 1000
  server.headersTimeout = 130 * 1000

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`)
  })
})
