import { Injector } from 'reduct'
import { Context } from 'koa'
import * as Router from 'koa-router'
import { Redis } from './Redis'
import { Config } from './Config'
import { Receipt } from '../lib/Receipt'

export class Balances {
  private config: Config
  private redis: Redis

  constructor (deps: Injector) {
    this.config = deps(Config)
    this.redis = deps(Redis)
  }

  async start (router: Router) {
    router.post('/balances/:id\\:creditReceipt', async (ctx: Context) => {
      const receipt = new Receipt({
        receipt: ctx.request.body,
        seed: this.config.receiptSeed
      })


      return ctx.status = 200

      // const amount = await this.redis.getReceiptValue()
      // if (amount) {
      //   await this.redis.addBalance(id, amount)
      // }
    })

    router.post('/balances/:id\\:spend', async (ctx: Context) => {
      return ctx.status = 200
      // verify id balance
      // update balance used
    })
  }
}
