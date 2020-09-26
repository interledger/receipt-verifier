import reduct from 'reduct'
import { createServer, Server } from 'http'
import { RECEIPT_LENGTH_BASE64 } from './Receipts'
import { Redis, BALANCE_KEY, RECEIPT_KEY, WEBHOOK_KEY } from './Redis'
import { Config } from './Config'
import { Receipt, RECEIPT_VERSION } from 'ilp-protocol-stream'
import * as Long from 'long'
import { AddressInfo } from 'net'
import * as raw from 'raw-body'

describe('Redis', () => {
  let balance = 0
  let config: Config
  let redis: Redis
  let revshareServer: Server
  let webhookUri: string

  beforeAll(async () => {
    revshareServer = createServer(async (req, res) => {
      if (req.method === 'POST' && req.url === '/receipts') {
        const body = await raw(req, {
          limit: RECEIPT_LENGTH_BASE64
        })
        balance += parseInt(body.toString())
      } else {
        res.writeHead(404)
      }
      res.end()
    })
    revshareServer.listen()
    webhookUri = `http://localhost:${(revshareServer.address() as AddressInfo).port}/receipts`
    process.env.REVSHARE_URI = `http://localhost:${(revshareServer.address() as AddressInfo).port}`
    const deps = reduct()
    config = deps(Config)
  })

  describe('constructor', () => {
    it('construct new Redis service', () => {
      const redis = reduct()(Redis)
    })
  })

  beforeAll(async () => {
    redis = reduct()(Redis)
    redis.start()
  })

  beforeEach(async () => {
    await redis.flushdb()
  })

  afterAll(async () => {
    revshareServer.close()
    await redis.flushdb()
    await redis.stop()
  })

  describe('cacheReceiptNonce', () => {
    it('creates new key with expiry', async () => {
      const nonce = '123'
      const key = `${RECEIPT_KEY}:${nonce}`
      expect(await redis._redis.exists(key)).toBe(0)
      await redis.cacheReceiptNonce(nonce)
      expect(await redis._redis.exists(key)).toBe(1)
      const ttl = await redis._redis.ttl(key)
      expect(ttl).toBeGreaterThan(0)
      expect(ttl).toBeLessThanOrEqual(config.receiptTTLSeconds)
    })

    it('stores webhook URI', async () => {
      const nonce = '123'
      const webhookUri = 'https://revshare.com/webhook'
      const key = `${RECEIPT_KEY}:${nonce}`
      expect(await redis._redis.exists(key)).toBe(0)
      await redis.cacheReceiptNonce(nonce, webhookUri)
      expect(await redis._redis.exists(key)).toBe(1)
      const storedWebhookUri = await redis._redis.hget(key, WEBHOOK_KEY)
      expect(storedWebhookUri).toStrictEqual(webhookUri)
    })
  })

  describe('getReceiptValue', () => {
    const nonce = Buffer.from('123', 'base64')
    const streamId = '1'

    beforeEach(async () => {
      await redis.cacheReceiptNonce(nonce.toString('base64'))
    })

    afterAll(() => {
      jest.clearAllMocks()
    })

    it('returns the amount of the initial receipt', async () => {
      const receipt = {
        nonce,
        streamId,
        totalReceived: Long.fromNumber(10),
        version: RECEIPT_VERSION
      }
      const value = await redis.getReceiptValue(receipt)
      expect(value.compare(receipt.totalReceived)).toBe(0)
    })

    it('sets stored receipt amount', async () => {
      const receipt = {
        nonce,
        streamId,
        totalReceived: Long.fromNumber(10),
        version: RECEIPT_VERSION
      }
      const key = `${RECEIPT_KEY}:${receipt.nonce.toString('base64')}`
      expect(await redis._redis.hget(key, receipt.streamId)).toBeNull()
      await redis.getReceiptValue(receipt)
      expect(await redis._redis.hget(key, receipt.streamId)).toBe(receipt.totalReceived.toString())
    })

    it('returns the incremented amount of a subsequent receipt', async () => {
      const receipt1 = {
        nonce,
        streamId,
        totalReceived: Long.fromNumber(10),
        version: RECEIPT_VERSION
      }
      const receipt2 = {
        nonce,
        streamId,
        totalReceived: Long.fromNumber(15),
        version: RECEIPT_VERSION
      }
      await redis.getReceiptValue(receipt1)
      const value = await redis.getReceiptValue(receipt2)
      expect(value.compare(5)).toBe(0)
    })

    it('increases stored receipt amount', async () => {
      const receipt1 = {
        nonce,
        streamId,
        totalReceived: Long.fromNumber(10),
        version: RECEIPT_VERSION
      }
      const receipt2 = {
        nonce,
        streamId,
        totalReceived: Long.fromNumber(15),
        version: RECEIPT_VERSION
      }
      const key = `${RECEIPT_KEY}:${receipt1.nonce.toString('base64')}`
      expect(await redis._redis.hget(key, streamId)).toBeNull()
      await redis.getReceiptValue(receipt1)
      expect(await redis._redis.hget(key, streamId)).toBe(receipt1.totalReceived.toString())
      await redis.getReceiptValue(receipt2)
      expect(await redis._redis.hget(key, streamId)).toBe(receipt2.totalReceived.toString())
    })

    it('returns zero for receipt with lower amount', async () => {
      const receipt1 = {
        nonce,
        streamId,
        totalReceived: Long.fromNumber(10),
        version: RECEIPT_VERSION
      }
      const receiptLess = {
        nonce,
        streamId,
        totalReceived: Long.fromNumber(5),
        version: RECEIPT_VERSION
      }
      await redis.getReceiptValue(receipt1)
      const value = await redis.getReceiptValue(receiptLess)
      expect(value.compare(0)).toBe(0)
    })

    it('won\'t decrease stored receipt amount', async () => {
      const receipt1 = {
        nonce,
        streamId,
        totalReceived: Long.fromNumber(10),
        version: RECEIPT_VERSION
      }
      const receiptOld = {
        nonce,
        streamId,
        totalReceived: Long.fromNumber(5),
        version: RECEIPT_VERSION
      }
      const key = `${RECEIPT_KEY}:${receipt1.nonce.toString('base64')}`
      expect(await redis._redis.hget(key, streamId)).toBeNull()
      await redis.getReceiptValue(receipt1)
      expect(await redis._redis.hget(key, streamId)).toBe(receipt1.totalReceived.toString())
      await redis.getReceiptValue(receiptOld)
      expect(await redis._redis.hget(key, streamId)).toBe(receipt1.totalReceived.toString())
    })

    it('throws for receipt amount greater than max 64 bit signed int', async () => {
      const receiptSafe = {
        nonce,
        streamId,
        totalReceived: Long.MAX_VALUE.toUnsigned(),
        version: RECEIPT_VERSION
      }
      const receiptBig = {
        nonce,
        streamId,
        totalReceived: receiptSafe.totalReceived.add(1),
        version: RECEIPT_VERSION
      }
      await redis.getReceiptValue(receiptSafe)
      try {
        await redis.getReceiptValue(receiptBig)
        fail()
      } catch (error) {
        expect(error.message).toBe('receipt amount exceeds max 64 bit signed integer')
      }
    })

    it('returns zero for expired receipt nonce', async () => {
      const receipt = {
        nonce: Buffer.from('expired'),
        streamId,
        totalReceived: Long.fromNumber(10),
        version: RECEIPT_VERSION
      }
      const value = await redis.getReceiptValue(receipt)
      expect(value.compare(0)).toBe(0)
    })

    it('store receipt amounts for multiple stream ids', async () => {
      const receipt1 = {
        nonce,
        streamId,
        totalReceived: Long.fromNumber(10),
        version: RECEIPT_VERSION
      }
      const receipt2 = {
        nonce,
        streamId: '2',
        totalReceived: Long.fromNumber(5),
        version: RECEIPT_VERSION
      }
      await redis.getReceiptValue(receipt1)
      const key2 = `${RECEIPT_KEY}:${receipt2.nonce.toString('base64')}`
      expect(await redis._redis.hget(key2, receipt2.streamId)).toBeNull()
      const value = await redis.getReceiptValue(receipt2)
      expect(value.compare(receipt2.totalReceived)).toBe(0)
    })

    it('submits the receipt amount(s) to the stored webhook URI', async () => {
      const nonce = Buffer.from('webhooktest', 'base64')
      await redis.cacheReceiptNonce(nonce.toString('base64'), webhookUri)

      const receipt1 = {
        nonce,
        streamId,
        totalReceived: Long.fromNumber(10),
        version: RECEIPT_VERSION
      }
      expect(balance).toStrictEqual(0)
      await redis.getReceiptValue(receipt1)
      expect(balance).toStrictEqual(10)
      const receipt2 = {
        nonce,
        streamId,
        totalReceived: Long.fromNumber(15),
        version: RECEIPT_VERSION
      }
      const value = await redis.getReceiptValue(receipt2)
      expect(balance).toStrictEqual(15)
    })
  })
})
