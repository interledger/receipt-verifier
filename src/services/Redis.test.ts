import reduct from 'reduct'
import { Redis, BALANCE_KEY, BALANCE_ID_KEY, RECEIPT_KEY } from './Redis'
import { Config } from './Config'
import { Receipt, RECEIPT_VERSION } from 'ilp-protocol-stream'
import * as Long from 'long'

describe('Redis', () => {
  let config: Config
  let redis: Redis

  process.env.SPSP_ENDPOINT = 'http://localhost:3000'

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

    it('stores balance id', async () => {
      const nonce = '123'
      const balanceId = 'abc'
      const key = `${RECEIPT_KEY}:${nonce}`
      expect(await redis._redis.exists(key)).toBe(0)
      await redis.cacheReceiptNonce(nonce, balanceId)
      expect(await redis._redis.exists(key)).toBe(1)
      const storedBalanceId = await redis._redis.hget(key, BALANCE_ID_KEY)
      expect(storedBalanceId).toStrictEqual(balanceId)
    })
  })

  describe('getReceiptBalanceId', () => {
    it('returns stored balance id', async () => {
      const nonce = '123'
      const balanceId = 'abc'
      const key = `${RECEIPT_KEY}:${nonce}`
      await redis.cacheReceiptNonce(nonce, balanceId)
      const storedBalanceId = await redis.getReceiptBalanceId(nonce)
      expect(storedBalanceId).toStrictEqual(balanceId)
    })

    it('returns null for no balance id', async () => {
      const nonce = '123'
      const key = `${RECEIPT_KEY}:${nonce}`
      await redis.cacheReceiptNonce(nonce)
      const storedBalanceId = await redis.getReceiptBalanceId(nonce)
      expect(storedBalanceId).toBeNull()
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

  })

  describe('creditBalance', () => {
    it('returns new balance', async () => {
      const id = 'id'
      const amount = Long.fromNumber(10)
      const key = `${BALANCE_KEY}:${id}`
      const balance = await redis.creditBalance(id, amount)
      expect(balance.compare(amount)).toBe(0)
    })

    it('returns updated balance', async () => {
      const id = 'id'
      const amount = Long.fromNumber(10)
      const key = `${BALANCE_KEY}:${id}`
      let balance = await redis.creditBalance(id, amount)
      expect(balance.compare(amount)).toBe(0)
      balance = await redis.creditBalance(id, amount)
      expect(balance.compare(amount.add(amount))).toBe(0)
    })

    it('creates new balance', async () => {
      const id = 'id'
      const amount = Long.fromNumber(10)
      const key = `${BALANCE_KEY}:${id}`
      expect(await redis._redis.get(key)).toBeNull()
      await redis.creditBalance(id, amount)
      expect(await redis._redis.get(key)).toBe(amount.toString())
    })

    it('increases balance', async () => {
      const id = 'id'
      const key = `${BALANCE_KEY}:${id}`
      await redis.creditBalance(id, Long.fromNumber(10))
      expect(await redis._redis.get(key)).toBe('10')
      await redis.creditBalance(id, Long.fromNumber(5))
      expect(await redis._redis.get(key)).toBe('15')
    })

    it('throws for negative credit amount', async () => {
      const id = 'id'
      const amount = Long.fromNumber(-1)
      try {
        await redis.creditBalance(id, amount)
        fail()
      } catch (error) {
        expect(error.message).toBe('credit amount must not be negative')
      }
    })

    it('throws for credit amount greater than max 64 bit signed integer', async () => {
      const id = 'id'
      const amountSafe = Long.MAX_VALUE.toUnsigned()
      const amountBig = amountSafe.add(1)
      await redis.creditBalance(id, amountSafe)
      try {
        await redis.creditBalance(id, amountBig)
        fail()
      } catch (error) {
        expect(error.message).toBe('credit amount exceeds max 64 bit signed integer')
      }
    })

    it('throws for balance greater than max 64 bit signed integer', async () => {
      const id = 'id'
      const one = Long.fromNumber(1)
      const key = `${BALANCE_KEY}:${id}`
      await redis._redis.set(key, Long.MAX_VALUE.subtract(1).toString())  // max int64 - 1
      await redis.creditBalance(id, one)                                  // max int64
      try {
        await redis.creditBalance(id, one)                                // max int64 + 1
        // ioredit-mock won't throw
        fail()
      } catch (error) {
        expect(error.message).toBe('balance cannot exceed max 64 bit signed integer')
      }
    })
  })

  describe('spendBalance', () => {
    it('returns new balance when balance is sufficient', async () => {
      const id = 'id'
      await redis.creditBalance(id, Long.fromNumber(10))
      const balance = await redis.spendBalance(id, Long.fromNumber(1))
      expect(balance.compare(9)).toBe(0)
    })

    it('throws when balance doesn\'t exist', async () => {
      const id = 'id'
      try {
        await redis.spendBalance(id, Long.fromNumber(10))
        // ioredit-mock won't throw
        fail()
      } catch (error) {
        expect(error.message).toBe('balance does not exist')
      }
    })

    it('throws when balance is insufficient', async () => {
      const id = 'id'
      await redis.creditBalance(id, Long.fromNumber(5))
      try {
        await redis.spendBalance(id, Long.fromNumber(10))
        // ioredit-mock won't throw
        fail()
      } catch (error) {
        expect(error.message).toBe('insufficient balance')
      }
    })

    it('won\'t create balance', async () => {
      const id = 'id'
      const key = `${BALANCE_KEY}:${id}`
      expect(await redis._redis.get(key)).toBeNull()
      try {
        await redis.spendBalance(id, Long.fromNumber(10))
        fail()
      } catch (error) {
        expect(await redis._redis.get(key)).toBeNull()
      }
    })

    it('won\'t decrease balance when balance is insuffient', async () => {
      const id = 'id'
      const key = `${BALANCE_KEY}:${id}`
      await redis.creditBalance(id, Long.fromNumber(5))
      expect(await redis._redis.get(key)).toBe('5')
      try {
        await redis.spendBalance(id, Long.fromNumber(10))
        fail()
      } catch (error) {
        expect(await redis._redis.get(key)).toBe('5')
      }
    })

    it('decreases balance', async () => {
      const id = 'id'
      const key = `${BALANCE_KEY}:${id}`
      await redis.creditBalance(id, Long.fromNumber(10))
      expect(await redis._redis.get(key)).toBe('10')
      let balance = await redis.spendBalance(id, Long.fromNumber(1))
      expect(balance.compare(9)).toBe(0)
      expect(await redis._redis.get(key)).toBe('9')
      balance = await redis.spendBalance(id, Long.fromNumber(2))
      expect(balance.compare(7)).toBe(0)
      expect(await redis._redis.get(key)).toBe('7')
    })

    it('throws for negative spend amount', async () => {
      const id = 'id'
      const amount = Long.fromNumber(-1)
      await redis.creditBalance(id, Long.fromNumber(10))
      try {
        await redis.spendBalance(id, amount)
        fail()
      } catch (error) {
        expect(error.message).toBe('spend amount must not be negative')
      }
    })

    it('throws for spend amount greater than max 64 bit signed integer', async () => {
      const id = 'id'
      const amountBig = Long.MAX_VALUE.toUnsigned().add(1)
      await redis.creditBalance(id, Long.fromNumber(10))
      try {
        await redis.spendBalance(id, amountBig)
        fail()
      } catch (error) {
        expect(error.message).toBe('spend amount exceeds max 64 bit signed integer')
      }
    })
  })
})
