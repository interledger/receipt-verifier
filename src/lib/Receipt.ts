import { Reader } from 'oer-utils'
import * as Long from 'long'
import { generateReceiptSecret, hmac } from '../util/crypto'

const RECEIPT_LENGTH = 65
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
    const receiptHmac = reader.readOctetString(32)
    const nonce = reader.readOctetString(16)

    const secret = generateReceiptSecret(seed, nonce)

    if (!receiptHmac.equals(hmac(secret, reader.buffer.slice(32)))) {
      throw new Error('invalid receipt')
    }

    const streamId = reader.readUInt8Number()
    const totalReceived = reader.readUInt64Long()
    const streamStartTime = reader.readUInt64Long()

    return new Receipt({
      id: `${nonce}:${streamId}`,
      totalReceived,
      streamStartTime
    })
  }

  getRemainingTTL (receiptTTLSeconds: number): number {
    const expireTime = this.streamStartTime.toNumber() + receiptTTLSeconds
    const remaining = expireTime - (Date.now() / 1000)
    return remaining > 0 ? remaining : 0
  }
}
