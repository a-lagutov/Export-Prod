// Dev-only log server — receives POST /log from the Figma plugin UI and writes to logs/
// Hot-reloads itself when the file changes (no need to restart npm run watch).
const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = 3001
const LOG_DIR = path.join(__dirname, '..', 'logs')
const LOG_UI = path.join(LOG_DIR, 'ui.log')
const LOG_FIGMA = path.join(LOG_DIR, 'figma.log')

fs.mkdirSync(LOG_DIR, { recursive: true })
fs.writeFileSync(LOG_UI, '', { flag: 'a' })
fs.writeFileSync(LOG_FIGMA, '', { flag: 'a' })

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'POST' && req.url === '/log') {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try {
        const entry = JSON.parse(body)
        const ts = entry.timestamp || new Date().toISOString()
        const level = (entry.level || 'log').toUpperCase().padEnd(5)
        const thread = (entry.thread || 'ui').padEnd(6)
        const data = entry.data !== undefined ? ' ' + JSON.stringify(entry.data) : ''
        const line = `[${ts}] [${level}] [${thread}] ${entry.message}${data}\n`
        const logFile = entry.thread === 'figma' ? LOG_FIGMA : LOG_UI
        fs.appendFileSync(logFile, line)
        process.stdout.write(line)
      } catch {}
      res.writeHead(200)
      res.end()
    })
    return
  }

  res.writeHead(404)
  res.end()
})

server.listen(PORT, () => {
  console.log(`Log server → http://localhost:${PORT}`)
  console.log(`UI log     → ${LOG_UI}`)
  console.log(`Figma log  → ${LOG_FIGMA}`)
})

module.exports = server
