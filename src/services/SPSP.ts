import { Injector } from 'reduct'
import { randomBytes, generateReceiptSecret } from '../util/crypto'
import { IncomingMessage, ServerResponse } from 'http'
import * as httpProxy from 'http-proxy'
import { Config } from './Config'

export class SPSP {
  private config: Config
  private proxyServer: httpProxy

  constructor (deps: Injector) {
    this.config = deps(Config)
    this.proxyServer = httpProxy.createProxyServer({
      target: this.config.spspEndpoint
    })
  }

  proxy (req: IncomingMessage, res: ServerResponse): void {
    const nonce = randomBytes(16)
    const secret = generateReceiptSecret(this.config.receiptSeed, nonce)
    return this.proxyServer.web(req, res, {
      headers: {
        'Receipt-Nonce': nonce.toString('base64'),
        'Receipt-Secret': secret.toString('base64')
      }
    })
  }

  close (): void {
    this.proxyServer.close()
  }
}
