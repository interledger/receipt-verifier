import reduct from 'reduct'
import { Redis, SPSP_ENDPOINT_KEY, SPSP_ID_KEY, RECEIPT_KEY } from './Redis'
import { Config } from './Config'
import { Receipt, RECEIPT_VERSION } from 'ilp-protocol-stream'
import * as Long from 'long'

describe('Redis', () => {
  let config: Config
  let redis: Redis

  beforeAll(async () => {
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
    await redis.flushdb()
    await redis.stop()
  })

  describe('cacheReceiptNonce', () => {
    const spspEndpoint = 'http://localhost:3000'

    it('creates new key with expiry', async () => {
      const nonce = '123'
      const key = `${RECEIPT_KEY}:${nonce}`
      expect(await redis._redis.exists(key)).toBe(0)
      await redis.cacheReceiptNonce(nonce, spspEndpoint)
      expect(await redis._redis.exists(key)).toBe(1)
      const ttl = await redis._redis.ttl(key)
      expect(ttl).toBeGreaterThan(0)
      expect(ttl).toBeLessThanOrEqual(config.receiptTTLSeconds)
    })

    it('stores SPSP endpoint', async () => {
      const nonce = '123'
      const key = `${RECEIPT_KEY}:${nonce}`
      expect(await redis._redis.exists(key)).toBe(0)
      await redis.cacheReceiptNonce(nonce, spspEndpoint)
      expect(await redis._redis.exists(key)).toBe(1)
      const storedSPSPEndpoint = await redis._redis.hget(key, SPSP_ENDPOINT_KEY)
      expect(storedSPSPEndpoint).toStrictEqual(spspEndpoint)
    })

    it('stores SPSP id', async () => {
      const nonce = '123'
      const key = `${RECEIPT_KEY}:${nonce}`
      const spspId = 'alice'
      expect(await redis._redis.exists(key)).toBe(0)
      await redis.cacheReceiptNonce(nonce, spspEndpoint, spspId)
      expect(await redis._redis.exists(key)).toBe(1)
      const storedSPSPId = await redis._redis.hget(key, SPSP_ID_KEY)
      expect(storedSPSPId).toStrictEqual(spspId)
    })
  })

  describe('getReceiptValue', () => {
    const nonce = Buffer.from('123', 'base64')
    const streamId = '1'
    const cachedSpspEndpoint = 'http://localhost:3000'

    beforeEach(async () => {
      await redis.cacheReceiptNonce(nonce.toString('base64'), cachedSpspEndpoint)
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
      const { value } = await redis.getReceiptValue(receipt)
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

    it('returns stored SPSP endpoint', async () => {
      const receipt = {
        nonce,
        streamId,
        totalReceived: Long.fromNumber(10),
        version: RECEIPT_VERSION
      }
      const { spspEndpoint } = await redis.getReceiptValue(receipt)
      expect(spspEndpoint).toStrictEqual(cachedSpspEndpoint)
    })

    it('does not return undefined SPSP id', async () => {
      const receipt = {
        nonce,
        streamId,
        totalReceived: Long.fromNumber(10),
        version: RECEIPT_VERSION
      }
      const { spspId } = await redis.getReceiptValue(receipt)
      expect(spspId).toBeNull()
    })

    it('returns stored SPSP id', async () => {
      const cachedSpspId = 'alice'
      await redis.cacheReceiptNonce(nonce.toString('base64'), cachedSpspEndpoint, cachedSpspId)
      const receipt = {
        nonce,
        streamId,
        totalReceived: Long.fromNumber(10),
        version: RECEIPT_VERSION
      }
      const { spspId } = await redis.getReceiptValue(receipt)
      expect(spspId).toStrictEqual(cachedSpspId)
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
      const { value } = await redis.getReceiptValue(receipt2)
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
      const { value } = await redis.getReceiptValue(receiptLess)
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
      const { value } = await redis.getReceiptValue(receipt)
      expect(value.compare(0)).toBe(0)
    })

    it('stores receipt amounts for multiple stream ids', async () => {
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
      const { value } = await redis.getReceiptValue(receipt2)
      expect(value.compare(receipt2.totalReceived)).toBe(0)
    })
  })
})
