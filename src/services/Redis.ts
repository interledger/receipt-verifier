import { Injector } from 'reduct'
import * as ioredis from 'ioredis'
import * as ioredisMock from 'ioredis-mock'
import * as Long from 'long'
import { Config } from './Config'
import { Receipt } from '../lib/Receipt'

interface CustomRedis extends ioredis.Redis {
  getReceiptValue(key: string, amount: number, ttlSeconds: number): Promise<number>
  spendBalance(key: string, amount: number): Promise<number>
}

interface CustomRedisMock extends ioredisMock {
  getReceiptValue(key: string, amount: number, ttlSeconds: number): Promise<number>
  spendBalance(key: string, amount: number): Promise<number>
}

export const BALANCE_KEY = 'ilpBalances'
export const RECEIPT_KEY = 'ilpReceipts'

export class Redis {
  private config: Config
  private redis: CustomRedis | CustomRedisMock

  constructor (deps: Injector) {
    this.config = deps(Config)
  }

  async start(redis?: ioredis.Redis | ioredisMock): Promise<void> {
    if (redis) {
      // @ts-ignore
      this.redis = redis
    } else if (process.env.NODE_ENV === 'test') {
      // @ts-ignore
      this.redis = new ioredisMock()  // use config
    } else {
      // @ts-ignore
      this.redis = new ioredis()  // use config
    }

    this.redis.defineCommand('getReceiptValue', {
      numberOfKeys: 1,
      lua: `
local amount = tonumber(ARGV[1])
local prevAmount = tonumber(redis.call('get', KEYS[1]))
local ttl = tonumber(ARGV[1])
if prevAmount then
  if prevAmount < amount then
    redis.call('set', KEYS[1], amount, 'KEEPTTL')
    return amount - prevAmount
  else
    return 0
  end
else
  redis.call('set', KEYS[1], amount, 'EX', ttl)
  return amount
end
`
    })

    this.redis.defineCommand('spendBalance', {
      numberOfKeys: 1,
      lua: `
local amount = tonumber(ARGV[1])
local balance = tonumber(redis.call('get', KEYS[1]))
if not balance then
  return redis.error_reply('balance does not exist')
elseif balance < amount then
  return redis.error_reply('insufficient balance')
end
return redis.call('decrby', KEYS[1], amount)
`
    })
  }

  async getReceiptValue (receipt: Receipt): Promise<Long> {
    const key = `${RECEIPT_KEY}:${receipt.id}`
    if (receipt.totalReceived.compare(Number.MAX_SAFE_INTEGER) === 1) {
      throw new Error('receipt amount exceeds MAX_SAFE_INTEGER')
    }
    const receiptTTL = receipt.getRemainingTTL(this.config.receiptTTLSeconds)
    if (receiptTTL === 0) {
      return Long.UZERO
    }
    const value = await this.redis.getReceiptValue(key, receipt.totalReceived.toNumber(), receiptTTL)
    return Long.fromNumber(value, true)
  }

  async creditBalance (id: string, amount: Long): Promise<Long> {
    if (amount.isNegative()) {
      throw new Error('credit amount must not be negative')
    } else if (amount.compare(Number.MAX_SAFE_INTEGER) === 1) {
      throw new Error('credit amount exceeds MAX_SAFE_INTEGER')
    }
    const key = `${BALANCE_KEY}:${id}`
    const balance = await this.redis.incrby(key, amount.toNumber())
    //should this error if balance exceeds MAX_SAFE_INTEGER since spendBalance cannot handle balance > MAX_SAFE_INTEGER?
    //should this catch incrby error and set balance to Long.MAX_VALUE? and throw a rephrased error?
    return Long.fromNumber(balance, true)
  }

  async spendBalance (id: string, amount: Long): Promise<Long> {
    if (amount.isNegative()) {
      throw new Error('spend amount must not be negative')
    } else if (amount.compare(Number.MAX_SAFE_INTEGER) === 1) {
      throw new Error('spend amount exceeds MAX_SAFE_INTEGER')
    }
    const key = `${BALANCE_KEY}:${id}`
    const balance = await this.redis.spendBalance(key, amount.toNumber())
    return Long.fromNumber(balance, true)
  }
}
