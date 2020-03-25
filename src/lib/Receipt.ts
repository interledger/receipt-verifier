import { Reader } from 'oer-utils'
import * as Long from 'long'
import { generateReceiptSecret, hmac } from '../util/crypto'

const RECEIPT_VERSION = 1
export { RECEIPT_VERSION }

const RECEIPT_LENGTH = 66
export { RECEIPT_LENGTH }

const RECEIPT_LENGTH_BASE64 = 88
export { RECEIPT_LENGTH_BASE64 }

export interface ReceiptOpts {
  id: string
  totalReceived: Long
  streamStartTime: Long
}

export class Receipt {
  id: string
  totalReceived: Long
  streamStartTime: Long

  constructor (opts: ReceiptOpts) {
    this.id = opts.id
    this.totalReceived = opts.totalReceived
    this.streamStartTime = opts.streamStartTime
  }

  static fromBuffer (receipt: Buffer, seed: Buffer): Receipt {
    const reader = Reader.from(receipt)
    if (reader.readUInt8Number() !== RECEIPT_VERSION) {
      throw new Error('invalid receipt version')
    }
    const nonce = reader.readOctetString(16)
    const streamId = reader.readUInt8Number()
    const totalReceived = reader.readUInt64Long()
    const streamStartTime = reader.readUInt64Long()

    const receiptHmac = reader.readOctetString(32)
    const secret = generateReceiptSecret(seed, nonce)

    if (!receiptHmac.equals(hmac(secret, reader.buffer.slice(0, 34)))) {
      throw new Error('invalid receipt')
    }

    return new Receipt({
      id: `${nonce}:${streamId}`,
      totalReceived,
      streamStartTime
    })
  }

  getRemainingTTL (receiptTTLSeconds: number): number {
    const expireTime = this.streamStartTime.toNumber() + receiptTTLSeconds
    const remaining = Math.ceil(expireTime - (Date.now() / 1000))
    return remaining > 0 ? remaining : 0
  }
}
