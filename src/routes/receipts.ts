import * as Koa from 'koa'
import * as Router from 'koa-router'
import * as raw from 'raw-body'
import { Receipt, ReceiptWithHMAC, verifyReceipt as verifyReceiptBytes } from 'ilp-protocol-stream'
import { generateReceiptSecret } from '../util/crypto'

export const RECEIPT_LENGTH_BASE64 = 80

const verifyReceipt = () => async (ctx: Koa.Context, next: Koa.Next) => {
  const body = await raw(ctx.req, {
    limit: RECEIPT_LENGTH_BASE64
  })

  let receipt: Receipt
  try {
    const receiptBytes = Buffer.from(body.toString(), 'base64')
    ctx.state.receipt = verifyReceiptBytes(receiptBytes, (decoded: ReceiptWithHMAC) => {
      return generateReceiptSecret(ctx.config.receiptSeed, decoded.nonce)
    })
  } catch (error) {
    ctx.throw(400, error.message)
  }

  try {
    ctx.state.receiptValue = await ctx.redis.getReceiptValue(ctx.state.receipt)
  } catch (error) {
    ctx.throw(409, error.message)
  }

  if (ctx.state.receiptValue.isZero()) {
    // too old or value is less than previously submitted receipt
    ctx.throw(400, 'expired receipt')
  }
  await next()
}

export const router = new Router()

router.post('/verifyReceipt', verifyReceipt(), async (ctx: Koa.Context) => {
  const spspEndpoint = await ctx.redis.getReceiptSPSPEndpoint(ctx.state.receipt.nonce.toString('base64'))
  ctx.response.body = JSON.stringify({
    amount: ctx.state.receiptValue.toString(),
    spspEndpoint
  })
  return ctx.status = 200
})
