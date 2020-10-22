import { Injector } from 'reduct'
import { randomBytes, generateReceiptSecret } from '../util/crypto'
import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import * as httpProxy from 'http-proxy'
import fetch from 'node-fetch'
import * as url from 'url'
import { Redis } from './Redis'
import { Config } from './Config'

function resolvePointer (pointer: string): string {
  if (!pointer.startsWith('$')) {
    return pointer
  }

  const protocol = (process.env.NODE_ENV === 'test') ? 'http://' : 'https://'
  const url = new URL(protocol + pointer.substring(1))
  if (url.pathname === '/') {
    url.pathname = '/.well-known/pay'
  }

  return url.href
}

export class SPSP {
  private config: Config
  private redis: Redis
  private proxyServer: httpProxy
  private server: Server

  constructor (deps: Injector) {
    this.config = deps(Config)
    this.redis = deps(Redis)
    this.proxyServer = httpProxy.createProxyServer({
      changeOrigin: true
    })
    this.server = createServer(async function(req: IncomingMessage, res: ServerResponse) {
      if (req.method === 'GET' && req.url && req.headers.accept && req.headers.accept.indexOf('application/spsp4+json') !== -1) {
        let spspEndpoint = this.config.spspEndpoint
        if (this.config.spspEndpointsUrl) {
          const id = encodeURIComponent(req.url.substring(1))
          const endpointsRes = await fetch(`${this.config.spspEndpointsUrl}?id=${id}`)
          if (endpointsRes.status !== 200) {
            console.error(await endpointsRes.text())
            res.statusCode = 404
            res.end()
            return
          }
          spspEndpoint = await endpointsRes.text()
        }
        const nonce = randomBytes(16)
        const secret = generateReceiptSecret(this.config.receiptSeed, nonce)
        this.proxyServer.once('proxyRes', function (proxyRes: IncomingMessage, req: IncomingMessage, res: ServerResponse) {
          const chunks: Buffer[] = []
          proxyRes.on('data', chunk => {
            chunks.push(chunk)
          })
          proxyRes.once('end', async () => {
            const body = Buffer.concat(chunks)
            try {
              const spspRes = JSON.parse(body.toString())
              if (spspRes.receipts_enabled) {
                // should this strip 'receipts_enabled'?
                await this.redis.cacheReceiptNonce(nonce.toString('base64'), spspEndpoint)
                res.writeHead(proxyRes.statusCode || 200, proxyRes.headers)
                res.end(body)
              } else {
                res.statusCode = 409
                res.end()
              }
            } catch (err) {
              res.statusCode = 409
              res.end()
            }
          })
        }.bind(this))
        this.proxyServer.web(req, res, {
          headers: {
            'Receipt-Nonce': nonce.toString('base64'),
            'Receipt-Secret': secret.toString('base64')
          },
          ignorePath: true,
          selfHandleResponse: true,
          target: resolvePointer(spspEndpoint)
        })
      } else if (req.method === 'OPTIONS' && req.headers['access-control-request-method'] === 'GET') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'web-monetization-id',
          'access-control-allow-methods': 'GET'
        })
        res.end()
      } else {
        res.statusCode = 404
        res.end()
      }
    }.bind(this))
  }

  start (): void {
    this.server.listen(this.config.spspProxyPort, () => {
      if (process.env.NODE_ENV !== 'test') {
        console.log('SPSP proxy listening on port: ' + this.config.spspProxyPort)
      }
    })
  }

  stop (): void {
    this.server.close()
    this.proxyServer.close()
  }
}
