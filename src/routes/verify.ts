import * as Koa from 'koa'
import * as Router from 'koa-router'
import * as raw from 'raw-body'
import { Receipt, ReceiptWithHMAC, verifyReceipt as verifyReceiptBytes } from 'ilp-protocol-stream'
import { generateReceiptSecret } from '../util/crypto'

export const RECEIPT_LENGTH_BASE64 = 80

export const router = new Router()

router.post('/verify', async (ctx: Koa.Context) => {
  const body = await raw(ctx.req, {
    limit: RECEIPT_LENGTH_BASE64
  })

  let receipt: Receipt
  try {
    const receiptBytes = Buffer.from(body.toString(), 'base64')
    receipt = verifyReceiptBytes(receiptBytes, (decoded: ReceiptWithHMAC) => {
      return generateReceiptSecret(ctx.config.receiptSeed, decoded.nonce)
    })
  } catch (error) {
    ctx.throw(400, error.message)
  }

  try {
    const { value, spspEndpoint, spspId } = await ctx.redis.getReceiptValue(receipt)
    if (!value || value.isZero()) {
      // too old or value is less than previously submitted receipt
      ctx.throw(400, 'expired receipt')
    }
    ctx.response.body = JSON.stringify({
      amount: value.toString(),
      id: spspId,
      spspEndpoint
    })
    return ctx.status = 200
  } catch (error) {
    if (error.message === 'expired receipt') {
      throw error
    } else {
      ctx.throw(409, error.message)
    }
  }
})
