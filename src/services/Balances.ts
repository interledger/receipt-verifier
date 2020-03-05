import { Injector } from 'reduct'
import { Context } from 'koa'
import * as Router from 'koa-router'
import { Redis } from './Redis'
import { Config } from './Config'
import { Receipt, RECEIPT_LENGTH } from '../lib/Receipt'
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
      const receiptBuf = await raw(ctx.req, {
        limit: RECEIPT_LENGTH
      })

      let receipt: Receipt
      try {
        receipt = Receipt.fromBuffer(receiptBuf, this.config.receiptSeed)
      } catch (error) {
        ctx.throw(400, error.message)
      }

      const amount = await this.redis.getReceiptValue(receipt)
      if (amount.isZero()) {
        // too old or value is less than previously submitted receipt
        ctx.throw(400, 'expired receipt')
      }

      const balance = await this.redis.creditBalance(ctx.params.id, amount)
      ctx.response.body = Buffer.from(balance.toBytes())
      return ctx.status = 200
    })

    router.post('/balances/:id\\:spend', async (ctx: Context) => {
      return ctx.status = 200
      // verify id balance
      // update balance used
    })
  }
}
