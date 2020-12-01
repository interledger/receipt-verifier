import reduct from 'reduct'
import fetch from 'node-fetch'
import * as Long from 'long'
import * as raw from 'raw-body'
import { RECEIPT_LENGTH_BASE64 } from './verify'
import { Config } from '../services/Config'
import { Redis } from '../services/Redis'
import { Server } from '../services/Server'
import { createReceipt, RECEIPT_VERSION } from 'ilp-protocol-stream'
import { generateReceiptSecret, hmac, randomBytes } from '../util/crypto'

describe('verify router', () => {
  let config: Config
  let redis: Redis
  let server: Server

  const nonce = Buffer.alloc(16)
  const spspEndpoint = 'http://localhost:3000'

  beforeAll(async () => {
    const deps = reduct()
    config = deps(Config)
    redis = deps(Redis)
    server = deps(Server)
    redis.start()
    server.start()
    await redis.flushdb()
  })

  beforeEach(async () => {
    await redis.cacheReceiptNonce(nonce.toString('base64'), spspEndpoint)
  })

  afterEach(async () => {
    await redis.flushdb()
  })

  afterAll(async () => {
    await server.stop()
    await redis.stop()
  })

  function makeReceipt(amount: Long, seed: Buffer, streamId = 1, receiptNonce = nonce): string {
    return createReceipt({
      nonce: receiptNonce,
      streamId,
      totalReceived: amount.toUnsigned(),
      secret: generateReceiptSecret(seed, receiptNonce)
    }).toString('base64')
  }

  describe('POST /verify', () => {
    it('returns value and SPSP endpoint of valid receipt', async () => {
      const amount = Long.fromNumber(10)
      const receipt = makeReceipt(amount, config.receiptSeed)
      const resp = await fetch(`http://localhost:${config.port}/verify`, {
        method: 'POST',
        body: receipt
      })
      expect(resp.status).toBe(200)
      const receiptResp = await resp.json()
      expect(receiptResp.amount).toStrictEqual(amount.toString())
      expect(receiptResp.spspEndpoint).toStrictEqual(spspEndpoint)
      expect(receiptResp.id).toBeUndefined()
    })

    it('returns cached SPSP id of valid receipt if present', async () => {
      const spspId = 'alice'
      await redis.cacheReceiptNonce(nonce.toString('base64'), spspEndpoint, spspId)
      const amount = Long.fromNumber(10)
      const receipt = makeReceipt(amount, config.receiptSeed)
      const resp = await fetch(`http://localhost:${config.port}/verify`, {
        method: 'POST',
        body: receipt
      })
      expect(resp.status).toBe(200)
      const receiptResp = await resp.json()
      expect(receiptResp.amount).toStrictEqual(amount.toString())
      expect(receiptResp.spspEndpoint).toStrictEqual(spspEndpoint)
      expect(receiptResp.id).toStrictEqual(spspId)
    })

    it('returns additional value of subsequent receipt', async () => {
      const id = 'id'
      const amount1 = Long.fromNumber(10)
      const receipt1 = makeReceipt(amount1, config.receiptSeed)
      const amount2 = Long.fromNumber(15)
      const receipt2 = makeReceipt(amount2, config.receiptSeed)

      const resp1 = await fetch(`http://localhost:${config.port}/verify`, {
        method: 'POST',
        body: receipt1
      })
      expect(resp1.status).toBe(200)

      const resp2 = await fetch(`http://localhost:${config.port}/verify`, {
        method: 'POST',
        body: receipt2
      })
      expect(resp2.status).toBe(200)
      const receiptResp = await resp2.json()
      expect(receiptResp.amount).toStrictEqual(amount2.subtract(amount1).toString())
    })

    it('returns 400 for invalid receipt', async () => {
      const id = 'id'
      const amount = Long.fromNumber(10)
      const badSeed = Buffer.alloc(32)
      const receipt = makeReceipt(amount, badSeed)
      const resp = await fetch(`http://localhost:${config.port}/verify`, {
        method: 'POST',
        body: receipt
      })
      expect(resp.status).toBe(400)
      const error = await resp.text()
      expect(error).toBe('invalid hmac')
    })

    it('returns 400 for expired receipt', async () => {
      const id = 'id'
      const amount = Long.fromNumber(10)
      const expiredNonce = randomBytes(16)
      const receipt = makeReceipt(amount, config.receiptSeed, 1, expiredNonce)
      const resp = await fetch(`http://localhost:${config.port}/verify`, {
        method: 'POST',
        body: receipt
      })
      expect(resp.status).toBe(400)
      const error = await resp.text()
      expect(error).toBe('expired receipt')
    })

    it('returns 400 for receipt with lower amount', async () => {
      const id = 'id'
      const amount1 = Long.fromNumber(15)
      const receipt1 = makeReceipt(amount1, config.receiptSeed)
      const amount2 = Long.fromNumber(10)
      const receipt2 = makeReceipt(amount2, config.receiptSeed)

      const resp1 = await fetch(`http://localhost:${config.port}/verify`, {
        method: 'POST',
        body: receipt1
      })
      expect(resp1.status).toBe(200)

      const resp2 = await fetch(`http://localhost:${config.port}/verify`, {
        method: 'POST',
        body: receipt2
      })
      expect(resp2.status).toBe(400)
      const error = await resp2.text()
      expect(error).toBe('expired receipt')
    })

    it('handles receipt amount greater than max 64 bit signed integer', async () => {
      const id = 'id'
      const amount = Long.MAX_VALUE.toUnsigned().add(1)
      const receipt = makeReceipt(amount, config.receiptSeed)
      const resp = await fetch(`http://localhost:${config.port}/verify`, {
        method: 'POST',
        body: receipt
      })
      expect(resp.status).toBe(200)
      const receiptResp = await resp.json()
      expect(receiptResp.amount).toStrictEqual(amount.toString())
    })

    it('returns 413 for body with length greater than RECEIPT_LENGTH_BASE64', async () => {
      const id = 'id'
      const receipt = Buffer.alloc(RECEIPT_LENGTH_BASE64+1).toString()
      const resp = await fetch(`http://localhost:${config.port}/verify`, {
        method: 'POST',
        body: receipt
      })
      expect(resp.status).toBe(413)
      const error = await resp.text()
      expect(error).toBe('request entity too large')
    })
  })
})
