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

      const receipt = Receipt.fromBuffer(receiptBuf, this.config.receiptSeed)

      const amount = await this.redis.getReceiptValue(receipt)
      if (amount) {
        const balance = await this.redis.creditBalance(ctx.params.id, amount)
        ctx.response.body = Buffer.from(balance.toBytes())
      }

      return ctx.status = 200
    })

    router.post('/balances/:id\\:spend', async (ctx: Context) => {
      return ctx.status = 200
      // verify id balance
      // update balance used
    })
  }
}
