import reduct from 'reduct'
import fetch from 'node-fetch'
import { createServer, Server } from 'http'
import { AddressInfo } from 'net'
import { Url } from 'url'
import { SPSP } from './SPSP'
import { Config } from './Config'
import { Redis, SPSP_ENDPOINT_KEY, RECEIPT_KEY } from './Redis'

describe('SPSP', () => {
  const NOT_FOUND = 'error'
  const INVALID = 'invalid'
  const PAYMENT_POINTER = 'paymentpointer'
  let spsp: SPSP
  let config: Config
  let redis: Redis
  let targetServer: Server
  let targetServerUrl: string
  let spspEndpointsServer: Server
  let spspEndpointsServerUrl: string
  let nRequests: number

  const OLD_ENV = process.env;

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
    targetServerUrl = `http://localhost:${(targetServer.address() as AddressInfo).port}`

    spspEndpointsServer = createServer(async (req, res) => {
      if (req.method === 'GET' && req.url) {
        const id = decodeURIComponent(new URL(req.url, 'http://localhost').searchParams.get('id') as string)
        switch (id) {
          case NOT_FOUND:
            res.writeHead(404)
            break
          case INVALID:
            res.writeHead(400)
            break
          default:
            res.write(`http://localhost:${(targetServer.address() as AddressInfo).port}`)
        }
      } else {
        res.writeHead(404)
      }
      res.end()
    })
    spspEndpointsServer.listen()
    spspEndpointsServerUrl = `http://localhost:${(spspEndpointsServer.address() as AddressInfo).port}`
  })

  afterAll(() => {
    process.env = OLD_ENV
    targetServer.close()
    spspEndpointsServer.close()
  })

  afterEach(async () => {
    await redis.flushdb()
  })

  async function startSPSPServer(): Promise<void> {
    const deps = reduct()
    spsp = deps(SPSP)
    config = deps(Config)
    redis = deps(Redis)
    redis.start()
    spsp.start()
    await redis.flushdb()
  }

  function stopSPSPServer(): void {
    spsp.stop()
    redis.stop()
  }

  describe.each([
    ['SPSP_ENDPOINT'],
    ['SPSP_ENDPOINTS_URL']
  ])('GET /.well-known/pay %s', (envVar) => {
    beforeAll(async () => {
      jest.resetModules()
      process.env = { ...OLD_ENV }
      process.env[envVar] = envVar === 'SPSP_ENDPOINT' ? targetServerUrl : spspEndpointsServerUrl
      await startSPSPServer()
      nRequests = 0
    })

    afterAll(() => {
      stopSPSPServer()
    })

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

    it('stores SPSP endpoint to redis', async () => {
      const resp = await fetch(`http://localhost:${config.spspProxyPort}/custom-path`, {
        headers: {
          Accept: 'application/spsp4+json'
        }
      })
      expect(resp.status).toBe(200)
      const body = await resp.json()
      const storedSPSPEndpoint = await redis._redis.hget(`${RECEIPT_KEY}:${body.nonce}`, SPSP_ENDPOINT_KEY)
      expect(storedSPSPEndpoint).toStrictEqual(targetServerUrl)
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

    it('returns 404 if SPSP endpoints url request fails', async () => {
      if (envVar === 'SPSP_ENDPOINTS_URL') {
        const resp = await fetch(`http://localhost:${config.spspProxyPort}/${NOT_FOUND}`, {
          headers: {
            Accept: 'application/spsp4+json'
          }
        })
        expect(resp.status).toBe(404)
      }
    })

    it('returns 404 if SPSP endpoints url response is missing spspEndpoint field', async () => {
      if (envVar === 'SPSP_ENDPOINTS_URL') {
        const resp = await fetch(`http://localhost:${config.spspProxyPort}/${INVALID}`, {
          headers: {
            Accept: 'application/spsp4+json'
          }
        })
        expect(resp.status).toBe(404)
      }
    })

    it('accepts payment pointer returned from SPSP endpoints url', async () => {
      if (envVar === 'SPSP_ENDPOINTS_URL') {
        const resp = await fetch(`http://localhost:${config.spspProxyPort}/${PAYMENT_POINTER}`, {
          headers: {
            Accept: 'application/spsp4+json'
          }
        })
        expect(resp.status).toBe(200)
      }
    })
  })
})
