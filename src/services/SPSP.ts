import { Injector } from 'reduct'
import { randomBytes, generateReceiptSecret } from '../util/crypto'
import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import * as httpProxy from 'http-proxy'
import * as url from 'url'
import { Config } from './Config'

export class SPSP {
  private config: Config
  private proxyServer: httpProxy
  private server: Server

  constructor (deps: Injector) {
    this.config = deps(Config)
    this.proxyServer = httpProxy.createProxyServer({
      target: this.config.spspEndpoint
    })
    this.server = createServer(function(req: IncomingMessage, res: ServerResponse) {
      const path = req.url && url.parse(req.url).pathname
      if (path && /\/\.well-known\/pay$/.test(path) &&
          req.headers.accept && req.headers.accept.indexOf('application/spsp4+json') !== -1) {
        const nonce = randomBytes(16)
        const secret = generateReceiptSecret(this.config.receiptSeed, nonce)
        this.proxyServer.web(req, res, {
          headers: {
            'Receipt-Nonce': nonce.toString('base64'),
            'Receipt-Secret': secret.toString('base64')
          }
        })
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
