import app from './app.js'
import { prisma } from './config/prisma.js'

const BASE_PORT = Number(process.env.PORT) || 3000
const MAX_ATTEMPTS = 20

function tryListen(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      resolve(server)
    })
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(err)
      } else {
        reject(err)
      }
    })
  })
}

async function start() {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const port = BASE_PORT + i
    try {
      await tryListen(port)
      console.log(`Server running on port ${port}`)
      if (port !== BASE_PORT) {
        console.log(`(Port ${BASE_PORT} was in use)`)
      }
      prisma.$connect().then(() => console.log('Database connected')).catch(() => {})
      return
    } catch (err) {
      if (err.code !== 'EADDRINUSE' || i === MAX_ATTEMPTS - 1) throw err
    }
  }
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
