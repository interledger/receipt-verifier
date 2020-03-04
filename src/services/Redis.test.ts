import reduct from 'reduct'
import { Redis, BALANCE_KEY, RECEIPT_KEY } from './Redis'
import { Receipt } from '../lib/Receipt'
import * as ioredisMock from 'ioredis-mock'
// import * as ioredis from 'ioredis'
import * as Long from 'long'

describe('Redis', () => {
  describe('constructor', () => {
    it('construct new Redis service', () => {
      const redis = reduct()(Redis)
    })
  })

  let redis: Redis
  let redisMock: ioredisMock
  // let redisMock: ioredis.Redis

  beforeEach(async () => {
    redisMock = new ioredisMock()
    // redisMock = new ioredis()
    redis = reduct()(Redis)
    await redis.start(redisMock)
    // await redisMock.flushall()
  })

  describe('getReceiptValue', () => {
    it('returns the amount of the initial receipt', async () => {
      const receipt = new Receipt ({
        id: 'receipt',
        totalReceived: Long.fromNumber(10, true),
        streamStartTime: Long.fromNumber(946684800, true)
      })
      const value = await redis.getReceiptValue(receipt)
      expect(value).toStrictEqual(receipt.totalReceived)
    })

    it('sets stored receipt amount', async () => {
      const receipt = new Receipt ({
        id: 'receipt',
        totalReceived: Long.fromNumber(10, true),
        streamStartTime: Long.fromNumber(946684800, true)
      })
      const key = `${RECEIPT_KEY}:${receipt.id}`
      expect(await redisMock.get(key)).toBeNull()
      await redis.getReceiptValue(receipt)
      const ret = await redisMock.get(key)
      // https://github.com/stipsan/ioredis-mock/issues/920
      // expect(await redisMock.get(key)).toBe(receipt.totalReceived.toString())
      expect(await redisMock.get(key)).toBe(receipt.totalReceived.toNumber())
    })

    it('returns the incremented amount of a subsequent receipt', async () => {
      const receipt1 = new Receipt ({
        id: 'receipt',
        totalReceived: Long.fromNumber(10, true),
        streamStartTime: Long.fromNumber(946684800, true)
      })
      const receipt2 = new Receipt ({
        id: receipt1.id,
        totalReceived: Long.fromNumber(15, true),
        streamStartTime: receipt1.streamStartTime
      })
      await redis.getReceiptValue(receipt1)
      const value = await redis.getReceiptValue(receipt2)
      expect(value).toStrictEqual(Long.fromNumber(5, true))
    })

    it('increases stored receipt amount', async () => {
      const receipt1 = new Receipt ({
        id: 'receipt',
        totalReceived: Long.fromNumber(10, true),
        streamStartTime: Long.fromNumber(946684800, true)
      })
      const receipt2 = new Receipt ({
        id: receipt1.id,
        totalReceived: Long.fromNumber(15, true),
        streamStartTime: receipt1.streamStartTime
      })
      const key = `${RECEIPT_KEY}:${receipt1.id}`
      expect(await redisMock.get(key)).toBeNull()
      await redis.getReceiptValue(receipt1)
      // expect(await redisMock.get(key)).toBe(receipt1.totalReceived.toString())
      expect(await redisMock.get(key)).toBe(receipt1.totalReceived.toNumber())
      await redis.getReceiptValue(receipt2)
      // expect(await redisMock.get(key)).toBe(receipt2.totalReceived.toString())
      expect(await redisMock.get(key)).toBe(receipt2.totalReceived.toNumber())
    })

    it('returns zero for an obsolete receipt', async () => {
      const receipt1 = new Receipt ({
        id: 'receipt',
        totalReceived: Long.fromNumber(10, true),
        streamStartTime: Long.fromNumber(946684800, true)
      })
      const receiptOld = new Receipt ({
        id: receipt1.id,
        totalReceived: Long.fromNumber(5, true),
        streamStartTime: receipt1.streamStartTime
      })
      await redis.getReceiptValue(receipt1)
      const value = await redis.getReceiptValue(receiptOld)
      expect(value).toStrictEqual(Long.UZERO)
    })

    it('won\t decrease stored receipt amount', async () => {
      const receipt1 = new Receipt ({
        id: 'receipt',
        totalReceived: Long.fromNumber(10, true),
        streamStartTime: Long.fromNumber(946684800, true)
      })
      const receiptOld = new Receipt ({
        id: receipt1.id,
        totalReceived: Long.fromNumber(5, true),
        streamStartTime: receipt1.streamStartTime
      })
      const key = `${RECEIPT_KEY}:${receipt1.id}`
      expect(await redisMock.get(key)).toBeNull()
      await redis.getReceiptValue(receipt1)
      // expect(await redisMock.get(key)).toBe(receipt1.totalReceived.toString())
      expect(await redisMock.get(key)).toBe(receipt1.totalReceived.toNumber())
      await redis.getReceiptValue(receiptOld)
      // expect(await redisMock.get(key)).toBe(receipt1.totalReceived.toString())
      expect(await redisMock.get(key)).toBe(receipt1.totalReceived.toNumber())
    })

    it('throws for receipt amount greater than MAX_SAFE_INTEGER', async () => {
      const receiptSafe = new Receipt ({
        id: 'receipt',
        totalReceived: Long.fromNumber(Number.MAX_SAFE_INTEGER, true),
        streamStartTime: Long.fromNumber(946684800, true)
      })
      const receiptBig = new Receipt ({
        id: receiptSafe.id,
        totalReceived: receiptSafe.totalReceived.add(1),
        streamStartTime: receiptSafe.streamStartTime
      })
      await redis.getReceiptValue(receiptSafe)
      try {
        await redis.getReceiptValue(receiptBig)
        fail()
      } catch (error) {
        expect(error.message).toBe('receipt amount exceeds MAX_SAFE_INTEGER')
      }
    })
  })

  describe('creditBalance', () => {
    it('creates new balance', async () => {
      const id = 'id'
      const amount = Long.fromNumber(10, true)
      const key = `${BALANCE_KEY}:${id}`
      expect(await redisMock.get(key)).toBeNull()
      await redis.creditBalance(id, amount)
      expect(await redisMock.get(key)).toBe(amount.toString())
    })

    it('increases balance', async () => {
      const id = 'id'
      const key = `${BALANCE_KEY}:${id}`
      await redis.creditBalance(id, Long.fromNumber(10, true))
      expect(await redisMock.get(key)).toBe('10')
      await redis.creditBalance(id, Long.fromNumber(5, true))
      expect(await redisMock.get(key)).toBe('15')
    })

    it('throws for credit amount greater than MAX_SAFE_INTEGER', async () => {
      const id = 'id'
      const amountSafe = Long.fromNumber(Number.MAX_SAFE_INTEGER, true)
      const amountBig = amountSafe.add(1)
      const key = `${BALANCE_KEY}:${id}`
      await redis.creditBalance(id, amountSafe)
      try {
        await redis.creditBalance(id, amountBig)
        fail()
      } catch (error) {
        expect(error.message).toBe('credit amount exceeds MAX_SAFE_INTEGER')
      }
    })

    // ioredit-mock won't throw
    it.skip('throws for balance greater than max 64 bit signed integer', async () => {
      console.log(Long.MAX_VALUE.subtract(1).toString())
      const id = 'id'
      const amount = Long.fromNumber(1, true)
      const key = `${BALANCE_KEY}:${id}`
      await redisMock.set(key, Long.MAX_VALUE.subtract(1).toString())  // max int64 - 1
      await redis.creditBalance(id, amount)                            // max int64
      try {
        await redis.creditBalance(id, amount)                          // max int64 + 1
        fail()
      } catch (error) {
        expect(error.message).toBe('ERR increment or decrement would overflow')
      }
    })

  })

  describe('spendBalance', () => {
    it('returns true when balance is sufficient', async () => {
      const id = 'id'
      await redis.creditBalance(id, Long.fromNumber(10, true))
      expect(await redis.spendBalance(id, 5)).toBe(true)
    })

    it('returns false when balance doesn\'t exist', async () => {
      const id = 'id'
      expect(await redis.spendBalance(id, 10)).toBe(false)
    })

    it('returns false when balance is insufficient', async () => {
      const id = 'id'
      await redis.creditBalance(id, Long.fromNumber(5, true))
      expect(await redis.spendBalance(id, 10)).toBe(false)
    })

    it('won\'t create balance', async () => {
      const id = 'id'
      const key = `${BALANCE_KEY}:${id}`
      expect(await redisMock.get(key)).toBeNull()
      expect(await redis.spendBalance(id, 1)).toBe(false)
      expect(await redisMock.get(key)).toBeNull()
    })

    it('won\'t create decrease balance when balance is insuffient', async () => {
      const id = 'id'
      const key = `${BALANCE_KEY}:${id}`
      await redis.creditBalance(id, Long.fromNumber(5, true))
      expect(await redisMock.get(key)).toBe('5')
      expect(await redis.spendBalance(id, 10)).toBe(false)
      expect(await redisMock.get(key)).toBe('5')
    })

    it('decreases balance', async () => {
      const id = 'id'
      const key = `${BALANCE_KEY}:${id}`
      await redis.creditBalance(id, Long.fromNumber(10, true))
      expect(await redisMock.get(key)).toBe('10')
      expect(await redis.spendBalance(id, 1)).toBe(true)
      expect(await redisMock.get(key)).toBe('9')
      expect(await redis.spendBalance(id, 2)).toBe(true)
      expect(await redisMock.get(key)).toBe('7')
    })
  })
})
