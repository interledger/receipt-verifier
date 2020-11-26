import { Injector } from 'reduct'
import * as ioredis from 'ioredis'
import * as Long from 'long'
import { Config } from './Config'
import { Receipt } from 'ilp-protocol-stream'

interface CustomRedis extends ioredis.Redis {
  getAndIncrReceipt(key: string, streamId: string, amount: string): Promise<string[]>
}

export const KEY_PREFIX = 'ilpReceipts:'
export const SPSP_ENDPOINT_KEY = 'spspEndpoint'
export const SPSP_ID_KEY = 'spspId'

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
    this.redis = new ioredis(this.config.redisUri, {
      keyPrefix: KEY_PREFIX
    }) as CustomRedis

    this.redis.defineCommand('getAndIncrReceipt', {
      numberOfKeys: 1,
      lua: `
local streamId = ARGV[1]
local amount = ARGV[2]
local prevAmount, spspEndpoint, spspId = unpack(redis.call('hmget', KEYS[1], streamId, 'spspEndpoint', 'spspId'))
if prevAmount then
  if string.len(prevAmount) < string.len(amount) or (string.len(prevAmount) == string.len(amount) and prevAmount < amount) then
    redis.call('hset', KEYS[1], streamId, amount)
  end
elseif spspEndpoint then
  redis.call('hset', KEYS[1], streamId, amount)
  return {'0',spspEndpoint,spspId}
end
return {prevAmount,spspEndpoint,spspId}
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
    await this.redis.hset(nonce, SPSP_ENDPOINT_KEY, spspEndpoint)
    if (spspId) {
      await this.redis.hset(nonce, SPSP_ID_KEY, spspId)
    }
    await this.redis.expire(nonce, this.config.receiptTTLSeconds)
  }

  async getReceiptValue (receipt: Receipt): Promise<ReceiptDetails> {
    const nonce = receipt.nonce.toString('base64')
    const [ prevAmount, spspEndpoint, spspId ] = await this.redis.getAndIncrReceipt(nonce, receipt.streamId, receipt.totalReceived.toString())
    return {
      value: prevAmount && receipt.totalReceived.gt(prevAmount) ? receipt.totalReceived.subtract(prevAmount) : Long.ZERO,
      spspEndpoint,
      spspId
    }
  }
}
