import { Injector } from 'reduct'
import { Context } from 'koa'
import * as Router from 'koa-router'
import { Redis } from './Redis'
import { Config } from './Config'
import { Receipt, RECEIPT_LENGTH_BASE64 } from '../lib/Receipt'
import * as Long from 'long'
import * as raw from 'raw-body'

export class Balances {
  private config: Config
  private redis: Redis

  constructor (deps: Injector) {
    this.config = deps(Config)
    this.redis = deps(Redis)
  }

  async start (router: Router) {
    router.post('/balances/:id\\:creditReceipt', async (ctx: Context) => {
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
        ctx.throw(413, error.message)
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
        ctx.throw(413, error.message)
      }
    })

    router.post('/balances/:id\\:spend', async (ctx: Context) => {
      const body = await raw(ctx.req, {
        limit: Long.MAX_UNSIGNED_VALUE.toString().length
      })
      const amount = Long.fromString(body.toString())

      try {
        const balance = await this.redis.spendBalance(ctx.params.id, amount)
        ctx.response.body = balance.toString()
        return ctx.status = 200
      } catch (error) {
        // 404 for unknown balance
        ctx.throw(413, error.message)
      }
    })
  }
}
