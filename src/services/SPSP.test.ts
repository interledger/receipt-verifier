import reduct from 'reduct'
import fetch from 'node-fetch'
import { createServer, Server } from 'http'
import { AddressInfo } from 'net'
import * as raw from 'raw-body'
import { SPSP } from './SPSP'
import { Config } from './Config'
import { Redis, RECEIPT_KEY, WEBHOOK_KEY } from './Redis'

describe('SPSP', () => {
  let spsp: SPSP
  let config: Config
  let redis: Redis
  let revshareServer: Server
  let targetServer: Server
  let nRequests = 0
  let webhookUri: string

  beforeAll(async () => {
    targetServer = createServer((req, res) => {
      nRequests++
      res.setHeader('access-control-allow-origin', '*')
      res.setHeader('access-control-allow-headers', 'web-monetization-id')
      res.setHeader('access-control-allow-methods', 'GET')
      if (req.method === 'GET') {
        res.write(JSON.stringify({
          nonce: req.headers['receipt-nonce'],
          receipts_enabled: nRequests !== 4
        }))
      } else {
        res.writeHead(204)
      }
      res.end()
    })
    targetServer.listen()
    revshareServer = createServer(async (req, res) => {
      if (req.method === 'GET') {
        res.write(JSON.stringify({
          paymentPointer: `http://localhost:${(targetServer.address() as AddressInfo).port}`,
          webhookUri
        }))
      } else {
        res.writeHead(404)
      }
      res.end()
    })
    revshareServer.listen()
    webhookUri = `http://localhost:${(revshareServer.address() as AddressInfo).port}/receipts`
    process.env.REVSHARE_URI = `http://localhost:${(revshareServer.address() as AddressInfo).port}`
    const deps = reduct()
    spsp = deps(SPSP)
    config = deps(Config)
    redis = deps(Redis)
    redis.start()
    spsp.start()
    await redis.flushdb()
  })

  afterAll(async () => {
    revshareServer.close()
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
      expect(resp.headers.get('access-control-allow-origin')).toContain('*')
      expect(resp.headers.get('access-control-allow-headers')).toContain('web-monetization-id')
      expect(resp.headers.get('access-control-allow-methods')).toContain('GET')
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

    it('stores revshare webhook URI to redis', async () => {
      const resp = await fetch(`http://localhost:${config.spspProxyPort}/.well-known/pay`, {
        headers: {
          Accept: 'application/spsp4+json'
        }
      })
      expect(resp.status).toBe(200)
      const body = await resp.json()
      const storedWebhookUri = await redis._redis.hget(`${RECEIPT_KEY}:${body.nonce}`, WEBHOOK_KEY)
      expect(storedWebhookUri).toStrictEqual(webhookUri)
    })

    it('returns 409 if SPSP endpoint doesn\'t support receipts', async () => {
      const resp = await fetch(`http://localhost:${config.spspProxyPort}/.well-known/pay`, {
        headers: {
          Accept: 'application/spsp4+json'
        }
      })
      expect(resp.status).toBe(409)
    })

    it('proxies preflight request to specified SPSP endpoint', async () => {
      const resp = await fetch(`http://localhost:${config.spspProxyPort}/.well-known/pay`, {
        method: 'OPTIONS',
        headers: {
          'Access-Control-Request-Headers': 'origin, x-requested-with',
          'Access-Control-Request-Method': 'GET'
        }
      })
      expect(resp.status).toBe(204)
      expect(resp.headers.get('access-control-allow-origin')).toContain('*')
      expect(resp.headers.get('access-control-allow-headers')).toContain('web-monetization-id')
      expect(resp.headers.get('access-control-allow-methods')).toContain('GET')
    })
  })
})
