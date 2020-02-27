import { Injector } from 'reduct'
import * as ioredis from 'ioredis'
import * as ioredisMock from 'ioredis-mock'
import { Config } from './Config'

interface CustomRedis extends ioredis.Redis {
  getReceiptValue(key: string, amount: number): Promise<number>
  spendBalance(key: string, amount: number): Promise<boolean>
}

interface CustomRedisMock extends ioredisMock {
  getReceiptValue(key: string, amount: number): Promise<number>
  spendBalance(key: string, amount: number): Promise<number>
}

export const BALANCE_KEY = 'ilpBalances'
export const RECEIPT_KEY = 'ilpReceipts'
export const BALANCE_RECEIVED = 'received'
export const BALANCE_USED = 'used'

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
if prevAmount then
  if prevAmount < amount then
    redis.call('set', KEYS[1], amount)
    return amount - prevAmount
  else
    return 0
  end
else
  redis.call('set', KEYS[1], amount)
  return amount
end
`
    })

//TODO: use single balance value
    this.redis.defineCommand('spendBalance', {
      numberOfKeys: 1,
      lua: `
local amount = tonumber(ARGV[1])
local received = tonumber(redis.call('hget', KEYS[1], '${BALANCE_RECEIVED}'))
local prevUsed = tonumber(redis.call('hget', KEYS[1], '${BALANCE_USED}'))
local used = prevUsed and (prevUsed + amount) or amount
if not received or received < used then
  return false
else
  redis.call('hincrby', KEYS[1], '${BALANCE_USED}', amount)
  return true
end
`
    })
  }

//include expiry (just pass in receipt object?)
  async getReceiptValue (receiptId: string, streamId: number, amount: number): Promise<number> {
    const key = `${RECEIPT_KEY}:${receiptId}:${streamId}`
    return this.redis.getReceiptValue(key, amount)
  }

  async creditBalance (id: string, amount: number): Promise<number> {
    const key = `${BALANCE_KEY}:${id}`
    return await this.redis.hincrby(key, BALANCE_RECEIVED, amount)
  }

  async spendBalance (id: string, amount: number): Promise<boolean> {
    const key = `${BALANCE_KEY}:${id}`

    // Lua boolean true -> Redis integer reply with value of 1.
    if (await this.redis.spendBalance(key, amount)) {
      return true
    } else {
      return false
    }
  }
}
