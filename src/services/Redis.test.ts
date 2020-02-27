import reduct from 'reduct'
import { Redis, BALANCE_KEY, RECEIPT_KEY, BALANCE_RECEIVED, BALANCE_USED } from './Redis'
import * as ioredisMock from 'ioredis-mock'
// import * as ioredis from 'ioredis'

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
  it('sets receipt amount', async () => {
    const receiptId = 'receipt'
    const streamId = 1
    const amount = 10
    const key = `${RECEIPT_KEY}:${receiptId}:${streamId}`
    expect(await redisMock.get(key)).toBeNull()
    await redis.getReceiptValue(receiptId, streamId, amount)
    const ret = await redisMock.get(key)
    // https://github.com/stipsan/ioredis-mock/issues/920
    // expect(await redisMock.get(key)).toBe(amount.toString())
    expect(await redisMock.get(key)).toBe(amount)
  })

  it('increases receipts amount', async () => {
    const receiptId = 'receipt'
    const streamId = 1
    const key = `${RECEIPT_KEY}:${receiptId}:${streamId}`
    expect(await redisMock.get(key)).toBeNull()
    await redis.getReceiptValue(receiptId, streamId, 10)
    // expect(await redisMock.get(key)).toBe('10')
    expect(await redisMock.get(key)).toBe(10)
    await redis.getReceiptValue(receiptId, streamId, 20)
    // expect(await redisMock.get(key)).toBe('20')
    expect(await redisMock.get(key)).toBe(20)
  })

  it('won\t decrease receipt amount', async () => {
    const receiptId = 'receipt'
    const streamId = 1
    const key = `${RECEIPT_KEY}:${receiptId}:${streamId}`
    expect(await redisMock.get(key)).toBeNull()
    await redis.getReceiptValue(receiptId, streamId, 10)
    // expect(await redisMock.get(key)).toBe('10')
    expect(await redisMock.get(key)).toBe(10)
    await redis.getReceiptValue(receiptId, streamId, 5)
    // expect(await redisMock.get(key)).toBe('10')
    expect(await redisMock.get(key)).toBe(10)
  })
})

describe('creditBalance', () => {
  it('creates new balance', async () => {
    const id = 'id'
    const amount = 10
    const key = `${BALANCE_KEY}:${id}`
    expect(await redisMock.hlen(key)).toBe(0)
    await redis.creditBalance(id, amount)
    expect(await redisMock.hlen(key)).toBe(1)
    expect(await redisMock.hget(key, BALANCE_RECEIVED)).toBe(amount.toString())
  })

  it('increases balance', async () => {
    const id = 'id'
    const key = `${BALANCE_KEY}:${id}`
    await redis.creditBalance(id, 10)
    expect(await redisMock.hlen(key)).toBe(1)
    expect(await redisMock.hget(key, BALANCE_RECEIVED)).toBe('10')
    await redis.creditBalance(id, 5)
    expect(await redisMock.hlen(key)).toBe(1)
    expect(await redisMock.hget(key, BALANCE_RECEIVED)).toBe('15')
  })
})

describe('spendBalance', () => {
  it('returns true when balance is sufficient', async () => {
    const id = 'id'
    await redis.creditBalance(id, 10)
    expect(await redis.spendBalance(id, 5)).toBe(true)
  })

  it('returns false when balance doesn\'t exist', async () => {
    const id = 'id'
    expect(await redis.spendBalance(id, 10)).toBe(false)
  })

  it('returns false when balance is insufficient', async () => {
    const id = 'id'
    await redis.creditBalance(id, 5)
    expect(await redis.spendBalance(id, 10)).toBe(false)
  })

  it('creates used balance field', async () => {
    const id = 'id'
    const key = `${BALANCE_KEY}:${id}`
    await redis.creditBalance(id, 10)
    expect(await redisMock.hlen(key)).toBe(1)
    expect(await redisMock.hexists(key, BALANCE_USED)).toBe(0)
    expect(await redis.spendBalance(id, 1)).toBe(true)
    expect(await redisMock.hget(key, BALANCE_USED)).toBe('1')
  })

  it('won\'t create used balance when received balance doesn\'t exist', async () => {
    const id = 'id'
    const key = `${BALANCE_KEY}:${id}`
    expect(await redisMock.hexists(key, BALANCE_USED)).toBe(0)
    expect(await redis.spendBalance(id, 1)).toBe(false)
    expect(await redisMock.hexists(key, BALANCE_USED)).toBe(0)
    expect(await redisMock.hexists(key, BALANCE_RECEIVED)).toBe(0)
  })

  it('won\'t create used balance when received balance is insuffient', async () => {
    const id = 'id'
    const key = `${BALANCE_KEY}:${id}`
    await redis.creditBalance(id, 5)
    expect(await redisMock.hexists(key, BALANCE_USED)).toBe(0)
    expect(await redis.spendBalance(id, 10)).toBe(false)
    expect(await redisMock.hexists(key, BALANCE_USED)).toBe(0)
  })

  it('increases used balance', async () => {
    const id = 'id'
    const key = `${BALANCE_KEY}:${id}`
    await redis.creditBalance(id, 10)
    expect(await redis.spendBalance(id, 1)).toBe(true)
    expect(await redisMock.hget(key, BALANCE_USED)).toBe('1')
    expect(await redis.spendBalance(id, 2)).toBe(true)
    expect(await redisMock.hget(key, BALANCE_USED)).toBe('3')
  })

  // it('won\'t increase used balance when received balance doesn\'t exist', async () => {
  // })

  it('won\'t increase used balance when received balance is insuffient', async () => {
    const id = 'id'
    const key = `${BALANCE_KEY}:${id}`
    await redis.creditBalance(id, 5)
    expect(await redis.spendBalance(id, 3)).toBe(true)
    expect(await redisMock.hget(key, BALANCE_USED)).toBe('3')
    expect(await redis.spendBalance(id, 3)).toBe(false)
    expect(await redisMock.hget(key, BALANCE_USED)).toBe('3')
  })
})
