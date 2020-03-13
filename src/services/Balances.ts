import { Injector } from 'reduct'
import { Server } from 'http'
import * as Koa from 'koa'
import * as Router from 'koa-router'
import * as Long from 'long'
import * as raw from 'raw-body'
import { Redis } from './Redis'
import { Config } from './Config'
import { Receipt, RECEIPT_LENGTH_BASE64 } from '../lib/Receipt'

export class Balances {
  private config: Config
  private redis: Redis
  private server: Server

  constructor (deps: Injector) {
    this.config = deps(Config)
    this.redis = deps(Redis)
  }

  start (): void {
    this.redis.start()

    const koa = new Koa()
    const router = new Router()

    router.post('/balances/:id\\:creditReceipt', async (ctx: Koa.Context) => {
      const body = await raw(ctx.req, {
        limit: RECEIPT_LENGTH_BASE64
      })

      let receipt: Receipt
      try {
        receipt = Receipt.fromBuffer(Buffer.from(body.toString(), 'base64'), this.config.receiptSeed)
      } catch (error) {
        ctx.throw(400, error.message)
      }

      let amount: Long
      try {
        amount = await this.redis.getReceiptValue(receipt)
      } catch (error) {
        ctx.throw(409, error.message)
      }

      if (amount.isZero()) {
        // too old or value is less than previously submitted receipt
        ctx.throw(400, 'expired receipt')
      }

      try {
        const balance = await this.redis.creditBalance(ctx.params.id, amount)
        ctx.response.body = balance.toString()
        return ctx.status = 200
      } catch (error) {
        ctx.throw(409, error.message)
      }
    })

    router.post('/balances/:id\\:spend', async (ctx: Koa.Context) => {
      const body = await raw(ctx.req, {
        limit: Long.MAX_UNSIGNED_VALUE.toString().length
      })
      const amount = Long.fromString(body.toString(), true)

      try {
        const balance = await this.redis.spendBalance(ctx.params.id, amount)
        ctx.response.body = balance.toString()
        return ctx.status = 200
      } catch (error) {
        // 404 for unknown balance
        ctx.throw(409, error.message)
      }
    })

    koa.use(router.routes())
    koa.use(router.allowedMethods());
    this.server = koa.listen(this.config.port, () => {
      if (process.env.NODE_ENV !== 'test') {
        console.log('Balances API listening on port: ' + this.config.port)
      }
    })
  }

  async stop (): Promise<void> {
    await this.redis.stop()
    this.server.close()
  }
}
