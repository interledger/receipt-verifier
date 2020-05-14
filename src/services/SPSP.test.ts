import reduct from 'reduct'
import fetch from 'node-fetch'
import { createServer, Server } from 'http'
import { SPSP } from './SPSP'
import { Config } from './Config'
import { Redis, RECEIPT_KEY } from './Redis'

describe('SPSP', () => {
  let spsp: SPSP
  let config: Config
  let redis: Redis
  let targetServer: Server
  let nRequests = 0

  beforeAll(async () => {
    targetServer = createServer((req, res) => {
      nRequests++
      res.write(JSON.stringify({
        nonce: req.headers['receipt-nonce'],
        receipts_enabled: nRequests !== 3
      }))
      res.end()
    })
    targetServer.listen()
    const address = targetServer.address()
    if (address && typeof address === 'object') {
      process.env.SPSP_ENDPOINT = `http://localhost:${address.port}`
    }
    const deps = reduct()
    spsp = deps(SPSP)
    config = deps(Config)
    redis = deps(Redis)
    redis.start()
    spsp.start()
    await redis.flushdb()
  })

  afterAll(async () => {
    targetServer.close()
    spsp.stop()
    await redis.flushdb()
    redis.stop()
  })

  describe('GET /.well-known/pay', () => {
    it('requires spsp4 header', async () => {
      const resp = await fetch(`http://localhost:${config.spspProxyPort}/.well-known/pay`, {
        headers: {
          Accept: 'application/json'
        }
      })
      expect(resp.ok).toBeFalsy()
      expect(resp.status).toBe(404)
    })

    it('proxies request to specified SPSP endpoint', async () => {
      const resp = await fetch(`http://localhost:${config.spspProxyPort}/.well-known/pay`, {
        headers: {
          Accept: 'application/spsp4+json'
        }
      })
      expect(resp.status).toBe(200)
      const body = await resp.json()
      expect(body.receipts_enabled).toBe(true)
    })

    it('stores receipt nonce with expiration to redis', async () => {
      const resp = await fetch(`http://localhost:${config.spspProxyPort}/.well-known/pay`, {
        headers: {
          Accept: 'application/spsp4+json'
        }
      })
      expect(resp.status).toBe(200)
      const body = await resp.json()
      const ttl = await redis._redis.ttl(`${RECEIPT_KEY}:${body.nonce}`)
      expect(ttl).toBeGreaterThan(0)
      expect(ttl).toBeLessThanOrEqual(config.receiptTTLSeconds)
    })

    it('returns 409 if SPSP endpoint doesn\'t support receipts', async () => {
      const resp = await fetch(`http://localhost:${config.spspProxyPort}/.well-known/pay`, {
        headers: {
          Accept: 'application/spsp4+json'
        }
      })
      expect(resp.status).toBe(409)
    })
  })
})
