const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

const dev = false
const hostname = '0.0.0.0'
const port = parseInt(process.env.PORT || '3210', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = createServer((req, res) => {
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
