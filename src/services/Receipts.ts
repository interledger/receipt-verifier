import { Injector } from 'reduct'
import { Server } from 'http'
import * as Koa from 'koa'
import * as cors from '@koa/cors'
import * as Router from 'koa-router'
import * as Long from 'long'
import * as raw from 'raw-body'
import { Redis } from './Redis'
import { Config } from './Config'
import { decodeReceipt, Receipt, ReceiptWithHMAC, verifyReceipt } from 'ilp-protocol-stream'
import { generateReceiptSecret, hmac } from '../util/crypto'

const RECEIPT_LENGTH_BASE64 = 80

export interface ReceiptResponse {
  nonce: string
  streamId: string
  totalReceived: string
}

export class Receipts {
  private config: Config
  private redis: Redis
  private server: Server

  constructor (deps: Injector) {
    this.config = deps(Config)
    this.redis = deps(Redis)
  }

  start (): void {
    const koa = new Koa()
    const router = new Router()

    router.post('/receipts', async (ctx: Koa.Context) => {
      const body = await raw(ctx.req, {
        limit: RECEIPT_LENGTH_BASE64
      })

      let receipt: Receipt
      try {
        const receiptBytes = Buffer.from(body.toString(), 'base64')
        receipt = verifyReceipt(receiptBytes, (decoded: ReceiptWithHMAC) => {
          return generateReceiptSecret(this.config.receiptSeed, decoded.nonce)
        })
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

      ctx.response.body = {
        nonce: receipt.nonce.toString('base64'),
        streamId: receipt.streamId.toString(),
        totalReceived: receipt.totalReceived.toString()
      }
      return ctx.status = 200
    })

    koa.use(cors())
    koa.use(router.routes())
    koa.use(router.allowedMethods())
    this.server = koa.listen(this.config.port, () => {
      if (process.env.NODE_ENV !== 'test') {
        console.log('Receipts API listening on port: ' + this.config.port)
      }
    })
  }

  stop (): void {
    this.server.close()
  }
}
