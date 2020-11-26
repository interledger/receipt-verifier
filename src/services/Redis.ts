import { Injector } from 'reduct'
import * as ioredis from 'ioredis'
import * as Long from 'long'
import { v4 as uuidv4 } from 'uuid'
import { Config } from './Config'
import { Receipt } from 'ilp-protocol-stream'

interface CustomRedis extends ioredis.Redis {
  getReceiptValue(key: string, tempKey: string, streamId: string, amount: string): Promise<string[]>
}

export const RECEIPT_KEY = 'ilpReceipts'
export const SPSP_ENDPOINT_KEY = 'spspEndpoint'
export const SPSP_ID_KEY = 'spspId'
const TEMP_KEY = 'ilpTemp'

interface ReceiptDetails {
  value: Long
  spspEndpoint?: string
  spspId?: string
}

export class Redis {
  private config: Config
  private redis: CustomRedis

  constructor (deps: Injector) {
    this.config = deps(Config)
  }

  start(): void {
    this.redis = new ioredis(this.config.redisUri) as CustomRedis

    // These Redis scripts use Redis to handle all numbers to avoid the
    // limited precision of Javascript and Lua numbers
    this.redis.defineCommand('getReceiptValue', {
      numberOfKeys: 2,
      lua: `
local streamId = ARGV[1]
local amount = ARGV[2]
local prevAmount, spspEndpoint, spspId = unpack(redis.call('hmget', KEYS[1], streamId, 'spspEndpoint', 'spspId'))
if prevAmount then
  local tempKey = KEYS[2]
  redis.call('set', tempKey, amount, 'EX', 1)
  redis.call('decrby', tempKey, prevAmount)
  local diff = redis.call('get', tempKey)
  if string.sub(diff, 1, 1) == '-' then
    return {'0'}
  else
    redis.call('hset', KEYS[1], streamId, amount)
    return {diff,spspEndpoint,spspId}
  end
elseif not spspEndpoint then
  return {'0'}
else
  redis.call('hset', KEYS[1], streamId, amount)
  return {amount,spspEndpoint,spspId}
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

  async getReceiptValue (receipt: Receipt): Promise<ReceiptDetails> {
    if (receipt.totalReceived.compare(Long.MAX_VALUE) === 1) {
      throw new Error('receipt amount exceeds max 64 bit signed integer')
    }

    const key = `${RECEIPT_KEY}:${receipt.nonce.toString('base64')}`
    const tempKey = `${TEMP_KEY}:${uuidv4()}`
    const [ value, spspEndpoint, spspId ] = await this.redis.getReceiptValue(key, tempKey, receipt.streamId, receipt.totalReceived.toString())
    return {
      value: Long.fromString(value),
      spspEndpoint,
      spspId
    }
  }
}
