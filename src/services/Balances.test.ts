import reduct from 'reduct'
import fetch from 'node-fetch'
import * as Long from 'long'
import * as raw from 'raw-body'
import { Balances } from './Balances'
import { Config } from './Config'
import { Redis } from './Redis'
import { createReceipt, RECEIPT_VERSION } from 'ilp-protocol-stream'
import { generateReceiptSecret, hmac, randomBytes } from '../util/crypto'

const RECEIPT_LENGTH_BASE64 = 80

describe('Balances', () => {
  let balances: Balances
  let config: Config
  let redis: Redis

  const nonce = Buffer.alloc(16)

  process.env.SPSP_ENDPOINT = 'http://localhost:3000'

  beforeAll(async () => {
    const deps = reduct()
    balances = deps(Balances)
    config = deps(Config)
    redis = deps(Redis)
    redis.start()
    balances.start()
    await redis.flushdb()
  })

  beforeEach(async () => {
    await redis.setReceiptTTL(nonce.toString('base64'))
  })

  afterEach(async () => {
    await redis.flushdb()
  })

  afterAll(() => {
    balances.stop()
    redis.stop()
  })

  function makeReceipt(amount: Long, seed: Buffer, streamId = 1, receiptNonce = nonce): string {
    return createReceipt({
      nonce: receiptNonce,
      streamId,
      totalReceived: amount.toUnsigned(),
      secret: generateReceiptSecret(seed, receiptNonce)
    }).toString('base64')
  }

  describe('POST /balances/{id}:creditReceipt', () => {
    it('returns balance for valid receipt', async () => {
      const id = 'id'
      const amount = Long.fromNumber(10)
      const receipt = makeReceipt(amount, config.receiptSeed)
      const resp = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt
      })
      expect(resp.status).toBe(200)
      const balance = await resp.text()
      expect(balance).toBe(amount.toString())
    })

    it('returns updated balance for subsequent receipt', async () => {
      const id = 'id'
      const amount1 = Long.fromNumber(10)
      const receipt1 = makeReceipt(amount1, config.receiptSeed)
      const amount2 = Long.fromNumber(15)
      const receipt2 = makeReceipt(amount2, config.receiptSeed)

      const resp1 = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt1
      })
      expect(resp1.status).toBe(200)

      const resp2 = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt2
      })
      expect(resp2.status).toBe(200)
      const balance = await resp2.text()
      expect(balance).toBe(amount2.toString())
    })

    it('returns 400 for invalid receipt', async () => {
      const id = 'id'
      const amount = Long.fromNumber(10)
      const badSeed = Buffer.alloc(32)
      const receipt = makeReceipt(amount, badSeed)
      const resp = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
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
      const resp = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
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

      const resp1 = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt1
      })
      expect(resp1.status).toBe(200)

      const resp2 = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt2
      })
      expect(resp2.status).toBe(400)
      const error = await resp2.text()
      expect(error).toBe('expired receipt')
    })

    it('returns 409 for receipt amount greater than max 64 bit signed integer', async () => {
      const id = 'id'
      const amount = Long.MAX_VALUE.toUnsigned().add(1)
      const receipt = makeReceipt(amount, config.receiptSeed)
      const resp = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt
      })
      expect(resp.status).toBe(409)
      const error = await resp.text()
      expect(error).toBe('receipt amount exceeds max 64 bit signed integer')
    })

    it('returns 409 for balance amount greater than max 64 bit signed integer', async () => {
      const id = 'id'
      const amount1 = Long.MAX_VALUE
      const receipt1 = makeReceipt(amount1, config.receiptSeed)
      const amount2 = Long.fromNumber(1)
      const receipt2 = makeReceipt(amount2, config.receiptSeed, 2)

      const resp1 = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt1
      })
      expect(resp1.status).toBe(200)

      const resp2 = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt2
      })
      // ioredit-mock won't throw
      expect(resp2.status).toBe(409)
      const error = await resp2.text()
      expect(error).toBe('balance cannot exceed max 64 bit signed integer')
    })

    it('returns 413 for body with length greater than RECEIPT_LENGTH_BASE64', async () => {
      const id = 'id'
      const receipt = Buffer.alloc(RECEIPT_LENGTH_BASE64+1).toString()
      const resp = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt
      })
      expect(resp.status).toBe(413)
      const error = await resp.text()
      expect(error).toBe('request entity too large')
    })
  })

  describe('POST /balances/{id}:spend', () => {

    it('returns new balance after spend', async () => {
      const id = 'id'
      const amount = Long.fromNumber(10)
      const receipt = makeReceipt(amount, config.receiptSeed)
      const resp1 = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt
      })
      expect(resp1.status).toBe(200)
      const spendAmount = Long.fromNumber(2)
      const resp2 = await fetch(`http://localhost:${config.port}/balances/${id}:spend`, {
        method: 'POST',
        body: spendAmount.toString()
      })
      expect(resp2.status).toBe(200)
      const balance = await resp2.text()
      expect(balance).toBe(amount.subtract(spendAmount).toString())
    })

    it('returns 404 for unknown balance id', async () => {
      const id = 'unknown'
      const resp = await fetch(`http://localhost:${config.port}/balances/${id}:spend`, {
        method: 'POST',
        body: '1'
      })
      // ioredit-mock won't throw
      expect(resp.status).toBe(404)
      const error = await resp.text()
      expect(error).toBe('balance does not exist')
    })

    it('returns 409 for insufficient balance', async () => {
      const id = 'id'
      const amount = Long.fromNumber(10)
      const receipt = makeReceipt(amount, config.receiptSeed)
      const resp1 = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt
      })
      expect(resp1.status).toBe(200)
      const spendAmount = Long.fromNumber(20)
      const resp2 = await fetch(`http://localhost:${config.port}/balances/${id}:spend`, {
        method: 'POST',
        body: spendAmount.toString()
      })
      // ioredit-mock won't throw
      expect(resp2.status).toBe(409)
      const error = await resp2.text()
      expect(error).toBe('insufficient balance')
    })

    it('returns 409 for spend amount greater than max 64 bit signed integer', async () => {
      const id = 'id'
      const amount = Long.MAX_VALUE.toUnsigned().add(1)
      const resp = await fetch(`http://localhost:${config.port}/balances/${id}:spend`, {
        method: 'POST',
        body: amount.toString()
      })
      expect(resp.status).toBe(409)
      const error = await resp.text()
      expect(error).toBe('spend amount exceeds max 64 bit signed integer')
    })

    it('returns 413 for body with length greater than max 64 bit unsigned integer', async () => {
      const id = 'id'
      const amount = Buffer.alloc(Long.MAX_VALUE.toString().length+1).toString()
      const resp = await fetch(`http://localhost:${config.port}/balances/${id}:spend`, {
        method: 'POST',
        body: amount
      })
      expect(resp.status).toBe(413)
      const error = await resp.text()
      expect(error).toBe('request entity too large')
    })
  })
})
