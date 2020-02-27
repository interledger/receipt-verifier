import { Injector } from 'reduct'
import { Context, Next } from 'koa'
import * as proxy from 'koa-proxies'
import * as Router from 'koa-router'
import { Config } from './Config'
import { randomBytes, generateReceiptSecret } from '../util/crypto'

export class SPSP {
  private config: Config

  constructor (deps: Injector) {
    this.config = deps(Config)
  }

  private checkHeader (ctx: Context, next: Next): void {
    if (ctx.request.accepts('application/spsp4+json')) {
      next()
    }
  }

  private addReceiptHeaders (ctx: Context, next: Next): void {
    const nonce = randomBytes(32)
    const secret = generateReceiptSecret(this.config.receiptSeed, nonce)
    ctx.request.headers['Receipt-Nonce'] = nonce.toString('base64')
    ctx.request.headers['Receipt-Secret'] = secret.toString('base64')
    next()
  }

  async start (router: Router) {
    // router.use(checkHeader)
    // router.use(addReceiptHeaders)
    // router.get('/.well-known/pay', proxy('/.well-known/pay', {
    router.get('/.well-known/pay', this.checkHeader, this.addReceiptHeaders, proxy('/.well-known/pay', {
      target: this.config.spspEndpoint
    }))
  }
}
