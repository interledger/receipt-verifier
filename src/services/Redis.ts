import { Injector } from 'reduct'
import * as ioredis from 'ioredis'
import * as ioredisMock from 'ioredis-mock'
import * as Long from 'long'
import { v4 as uuidv4 } from 'uuid'
import { Config } from './Config'
import { Receipt } from 'ilp-protocol-stream'

interface CustomRedis extends ioredis.Redis {
  getReceiptValue(key: string, tempKey: string, streamId: string, amount: string): Promise<string>
}

interface CustomRedisMock extends ioredisMock {
  getReceiptValue(key: string, tempKey: string, streamId: string, amount: string): Promise<string>
}

export const RECEIPT_KEY = 'ilpReceipts'
export const SPSP_ENDPOINT_KEY = 'spspEndpoint'
export const SPSP_ID_KEY = 'spspId'
const TEMP_KEY = 'ilpTemp'

interface SpspDetails {
  spspEndpoint: string
  spspId?: string
}

export class Redis {
  private config: Config
  private redis: CustomRedis | CustomRedisMock

  constructor (deps: Injector) {
    this.config = deps(Config)
  }

  start(): void {
    if (this.config.redisUri === 'mock') {
      this.redis = new ioredisMock() as CustomRedisMock
    } else {
      this.redis = new ioredis(this.config.redisUri) as CustomRedis
    }

    // These Redis scripts use Redis to handle all numbers to avoid the
    // limited precision of Javascript and Lua numbers
    this.redis.defineCommand('getReceiptValue', {
      numberOfKeys: 2,
      lua: `
local streamId = ARGV[1]
local amount = ARGV[2]
local prevAmount = redis.call('hget', KEYS[1], streamId)
if prevAmount then
  local tempKey = KEYS[2]
  redis.call('set', tempKey, amount, 'EX', 1)
  redis.call('decrby', tempKey, prevAmount)
  local diff = redis.call('get', tempKey)
  if string.sub(diff, 1, 1) == '-' then
    return '0'
  else
    redis.call('hset', KEYS[1], streamId, amount)
    return diff
  end
else
  redis.call('hset', KEYS[1], streamId, amount)
  return amount
end
`
    })
  }

  async stop (): Promise<void> {
    await this.redis.quit()
  }

  get _redis() {
    return this.redis
  }

  async flushdb (): Promise<void> {
    await this.redis.flushdb()
  }

  async cacheReceiptNonce (nonce: string, spspEndpoint: string, spspId?: string): Promise<void> {
    const key = `${RECEIPT_KEY}:${nonce}`
    await this.redis.hset(key, SPSP_ENDPOINT_KEY, spspEndpoint)
    if (spspId) {
      await this.redis.hset(key, SPSP_ID_KEY, spspId)
    }
    await this.redis.expire(key, this.config.receiptTTLSeconds)
  }

  async getReceiptSPSPDetails (nonce: string): Promise<SpspDetails> {
    const key = `${RECEIPT_KEY}:${nonce}`
    const [ spspEndpoint, spspId ] = await this.redis.hmget(key, SPSP_ENDPOINT_KEY, SPSP_ID_KEY)
    return {
      spspEndpoint,
      spspId
    }
  }

  async getReceiptValue (receipt: Receipt): Promise<Long> {
    if (receipt.totalReceived.compare(Long.MAX_VALUE) === 1) {
      throw new Error('receipt amount exceeds max 64 bit signed integer')
    }
    const key = `${RECEIPT_KEY}:${receipt.nonce.toString('base64')}`
    if (await this.redis.exists(key)) {
      const tempKey = `${TEMP_KEY}:${uuidv4()}`
      const value = await this.redis.getReceiptValue(key, tempKey, receipt.streamId, receipt.totalReceived.toString())
      return Long.fromString(value)
    } else {
      return Long.UZERO
    }
  }
}
