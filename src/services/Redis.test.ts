import reduct from 'reduct'
import { Redis, BALANCE_KEY, RECEIPT_KEY } from './Redis'
import { Config } from './Config'
import { Receipt } from '../lib/Receipt'
import * as ioredisMock from 'ioredis-mock'
// import * as ioredis from 'ioredis'
import * as Long from 'long'

describe('Redis', () => {
  let config: Config

  beforeAll(async () => {
    const deps = reduct()
    config = deps(Config)
  })

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

    const streamTime = new Date('2000-01-01T00:00:00.000Z')
    const now        = new Date('2000-01-01T00:01:00.000Z')
    const streamStartTime = Long.fromNumber(Math.floor(streamTime.valueOf() / 1000), true)

    beforeAll(() => {
      jest.spyOn(global.Date, 'now')
      .mockImplementation(() =>
        now.valueOf()
      )
    })

    afterAll(() => {
      jest.clearAllMocks()
    })

    it('returns the amount of the initial receipt', async () => {
      const receipt = new Receipt ({
        id: 'receipt',
        totalReceived: Long.fromNumber(10, true),
        streamStartTime
      })
      const value = await redis.getReceiptValue(receipt)
      expect(value).toStrictEqual(receipt.totalReceived)
    })

    it('sets stored receipt amount', async () => {
      const receipt = new Receipt ({
        id: 'receipt',
        totalReceived: Long.fromNumber(10, true),
        streamStartTime
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
        streamStartTime
      })
      const receipt2 = new Receipt ({
        id: receipt1.id,
        totalReceived: Long.fromNumber(15, true),
        streamStartTime
      })
      await redis.getReceiptValue(receipt1)
      const value = await redis.getReceiptValue(receipt2)
      expect(value).toStrictEqual(Long.fromNumber(5, true))
    })

    it('increases stored receipt amount', async () => {
      const receipt1 = new Receipt ({
        id: 'receipt',
        totalReceived: Long.fromNumber(10, true),
        streamStartTime
      })
      const receipt2 = new Receipt ({
        id: receipt1.id,
        totalReceived: Long.fromNumber(15, true),
        streamStartTime
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

    it('returns zero for receipt with lower amount', async () => {
      const receipt1 = new Receipt ({
        id: 'receipt',
        totalReceived: Long.fromNumber(10, true),
        streamStartTime
      })
      const receiptLess = new Receipt ({
        id: receipt1.id,
        totalReceived: Long.fromNumber(5, true),
        streamStartTime
      })
      await redis.getReceiptValue(receipt1)
      const value = await redis.getReceiptValue(receiptLess)
      expect(value).toStrictEqual(Long.UZERO)
    })

    it('won\t decrease stored receipt amount', async () => {
      const receipt1 = new Receipt ({
        id: 'receipt',
        totalReceived: Long.fromNumber(10, true),
        streamStartTime
      })
      const receiptOld = new Receipt ({
        id: receipt1.id,
        totalReceived: Long.fromNumber(5, true),
        streamStartTime
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
        streamStartTime
      })
      const receiptBig = new Receipt ({
        id: receiptSafe.id,
        totalReceived: receiptSafe.totalReceived.add(1),
        streamStartTime
      })
      await redis.getReceiptValue(receiptSafe)
      try {
        await redis.getReceiptValue(receiptBig)
        fail()
      } catch (error) {
        expect(error.message).toBe('receipt amount exceeds MAX_SAFE_INTEGER')
      }
    })

    it('returns zero for expired receipt', async () => {
      const oldStreamTime = Math.floor(Date.now()/1000) - config.receiptTTLSeconds

      const receipt = new Receipt ({
        id: 'receipt',
        totalReceived: Long.fromNumber(10, true),
        streamStartTime: Long.fromNumber(oldStreamTime, true)
      })
      const value = await redis.getReceiptValue(receipt)
      expect(value).toStrictEqual(Long.UZERO)
    })

    it('sets stored receipt expiration', async () => {
      const receipt = new Receipt ({
        id: 'receipt',
        totalReceived: Long.fromNumber(10, true),
        streamStartTime
      })
      const key = `${RECEIPT_KEY}:${receipt.id}`
      expect(await redisMock.get(key)).toBeNull()
      await redis.getReceiptValue(receipt)
      const ret = await redisMock.get(key)
      expect(await redisMock.get(key)).toBeTruthy()
      jest.spyOn(global.Date, 'now')
      .mockImplementationOnce(() =>
        now.valueOf() + (config.receiptTTLSeconds * 1000)
      )
      expect(await redisMock.get(key)).toBeNull()
    })
  })

  describe('creditBalance', () => {
    it('returns new balance', async () => {
      const id = 'id'
      const amount = Long.fromNumber(10, true)
      const key = `${BALANCE_KEY}:${id}`
      const balance = await redis.creditBalance(id, amount)
      expect(balance).toStrictEqual(amount)
    })

    it('returns updated balance', async () => {
      const id = 'id'
      const amount = Long.fromNumber(10, true)
      const key = `${BALANCE_KEY}:${id}`
      let balance = await redis.creditBalance(id, amount)
      expect(balance).toStrictEqual(amount)
      balance = await redis.creditBalance(id, amount)
      expect(balance).toStrictEqual(amount.add(amount))
    })

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
    it('returns new balance when balance is sufficient', async () => {
      const id = 'id'
      await redis.creditBalance(id, Long.fromNumber(10, true))
      const balance = await redis.spendBalance(id, Long.fromNumber(1, true))
      expect(balance).toStrictEqual(Long.fromNumber(9, true))
    })

    // ioredit-mock won't throw
    it.skip('throws when balance doesn\'t exist', async () => {
      const id = 'id'
      try {
        await redis.spendBalance(id, Long.fromNumber(10, true))
        fail()
      } catch (error) {
        expect(error.message).toBe('balance does not exist')
      }
    })

    // ioredit-mock won't throw
    it.skip('throws when balance is insufficient', async () => {
      const id = 'id'
      await redis.creditBalance(id, Long.fromNumber(5, true))
      try {
        await redis.spendBalance(id, Long.fromNumber(10, true))
        fail()
      } catch (error) {
        expect(error.message).toBe('insufficient balance')
      }
    })

    it('won\'t create balance', async () => {
      const id = 'id'
      const key = `${BALANCE_KEY}:${id}`
      expect(await redisMock.get(key)).toBeNull()
      try {
        await redis.spendBalance(id, Long.fromNumber(10, true))
        fail()
      } catch (error) {
        expect(await redisMock.get(key)).toBeNull()
      }
    })

    it('won\'t decrease balance when balance is insuffient', async () => {
      const id = 'id'
      const key = `${BALANCE_KEY}:${id}`
      await redis.creditBalance(id, Long.fromNumber(5, true))
      expect(await redisMock.get(key)).toBe('5')
      try {
        await redis.spendBalance(id, Long.fromNumber(10, true))
        fail()
      } catch (error) {
        expect(await redisMock.get(key)).toBe('5')
      }
    })

    it('decreases balance', async () => {
      const id = 'id'
      const key = `${BALANCE_KEY}:${id}`
      await redis.creditBalance(id, Long.fromNumber(10, true))
      expect(await redisMock.get(key)).toBe('10')
      let balance = await redis.spendBalance(id, Long.fromNumber(1, true))
      expect(balance).toStrictEqual(Long.fromNumber(9, true))
      expect(await redisMock.get(key)).toBe('9')
      balance = await redis.spendBalance(id, Long.fromNumber(2, true))
      expect(balance).toStrictEqual(Long.fromNumber(7, true))
      expect(await redisMock.get(key)).toBe('7')
    })

    it('throws for spend amount greater than MAX_SAFE_INTEGER', async () => {
      const id = 'id'
      const amountBig = Long.fromNumber(Number.MAX_SAFE_INTEGER, true).add(1)
      await redis.creditBalance(id, Long.fromNumber(10, true))
      try {
        await redis.spendBalance(id, amountBig)
        fail()
      } catch (error) {
        expect(error.message).toBe('spend amount exceeds MAX_SAFE_INTEGER')
      }
    })
  })
})
