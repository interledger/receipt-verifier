import { Injector } from 'reduct'
import * as ioredis from 'ioredis'
import * as ioredisMock from 'ioredis-mock'
import * as Long from 'long'
import { v4 as uuidv4 } from 'uuid'
import { Config } from './Config'
import { Receipt } from '../lib/Receipt'

interface CustomRedis extends ioredis.Redis {
  getReceiptValue(key: string, tempKey: string, amount: string, ttlSeconds: number): Promise<string>
  creditBalance(key: string, amount: string): Promise<string>
  spendBalance(key: string, amount: string): Promise<string>
}

interface CustomRedisMock extends ioredisMock {
  getReceiptValue(key: string, tempKey: string, amount: string, ttlSeconds: number): Promise<string>
  creditBalance(key: string, amount: string): Promise<string>
  spendBalance(key: string, amount: string): Promise<string>
}

export const BALANCE_KEY = 'ilpBalances'
export const RECEIPT_KEY = 'ilpReceipts'
const TEMP_KEY = 'ilpTemp'

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

    // These Redis scripts use Redis to handle all numbers to avoid the
    // limited precision of Javascript and Lua numbers
    this.redis.defineCommand('getReceiptValue', {
      numberOfKeys: 2,
      lua: `
local amount = ARGV[1]
local ttl = ARGV[2]
local prevAmount = redis.call('get', KEYS[1])
if prevAmount then
  local tempKey = KEYS[2]
  redis.call('set', tempKey, amount, 'EX', 1)
  redis.call('decrby', tempKey, prevAmount)
  local diff = redis.call('get', tempKey)
  if string.sub(diff, 1, 1) == '-' then
    return '0'
  else
    redis.call('set', KEYS[1], amount, 'EX', ttl)
    return diff
  end
else
  redis.call('set', KEYS[1], amount, 'EX', ttl)
  return amount
end
`
    })

    this.redis.defineCommand('creditBalance', {
      numberOfKeys: 1,
      lua: `
local amount = ARGV[1]
redis.call('incrby', KEYS[1], amount)
return redis.call('get', KEYS[1])
`
    })

    this.redis.defineCommand('spendBalance', {
      numberOfKeys: 1,
      lua: `
if redis.call('get', KEYS[1]) then
  local amount = ARGV[1]
  redis.call('decrby', KEYS[1], amount)
  local balance = redis.call('get', KEYS[1])
  if string.sub(balance, 1, 1) == '-' then
    redis.call('incrby', KEYS[1], amount)
    return redis.error_reply('insufficient balance')
  else
    return balance
  end
else
  return redis.error_reply('balance does not exist')
end
`
    })
  }

  async stop (): Promise<void> {
    await this.redis.quit()
  }

  async flushall (): Promise<void> {
    await this.redis.flushall()
  }

  async getReceiptValue (receipt: Receipt): Promise<Long> {
    if (receipt.totalReceived.compare(Long.MAX_VALUE) === 1) {
      throw new Error('receipt amount exceeds max 64 bit signed integer')
    }
    const receiptTTL = receipt.getRemainingTTL(this.config.receiptTTLSeconds)
    if (receiptTTL === 0) {
      return Long.UZERO
    }
    const key = `${RECEIPT_KEY}:${receipt.id}`
    const tempKey = `${TEMP_KEY}:${uuidv4()}`
    const value = await this.redis.getReceiptValue(key, tempKey, receipt.totalReceived.toString(), receiptTTL)
    return Long.fromString(value)
  }

  async creditBalance (id: string, amount: Long): Promise<Long> {
    if (amount.isNegative()) {
      throw new Error('credit amount must not be negative')
    } else if (amount.compare(Long.MAX_VALUE) === 1) {
      throw new Error('credit amount exceeds max 64 bit signed integer')
    }
    const key = `${BALANCE_KEY}:${id}`
    try {
      const balance = await this.redis.creditBalance(key, amount.toString())
      return Long.fromString(balance)
    } catch (err) {
      throw new Error('balance cannot exceed max 64 bit signed integer')
    }
  }

  async spendBalance (id: string, amount: Long): Promise<Long> {
    if (amount.isNegative()) {
      throw new Error('spend amount must not be negative')
    } else if (amount.compare(Long.MAX_VALUE) === 1) {
      throw new Error('spend amount exceeds max 64 bit signed integer')
    }
    const key = `${BALANCE_KEY}:${id}`
    const balance = await this.redis.spendBalance(key, amount.toString())
    return Long.fromString(balance)
  }
}
