import { Reader } from 'oer-utils'
import * as Long from 'long'
import { generateReceiptSecret, hmac } from '../util/crypto'

const RECEIPT_VERSION = 1
export { RECEIPT_VERSION }

const RECEIPT_LENGTH = 58
export { RECEIPT_LENGTH }

const RECEIPT_LENGTH_BASE64 = 80
export { RECEIPT_LENGTH_BASE64 }

export interface ReceiptOpts {
  nonce: string
  streamId: string
  totalReceived: Long
}

export class Receipt {
  nonce: string
  streamId: string
  totalReceived: Long

  constructor (opts: ReceiptOpts) {
    this.nonce = opts.nonce
    this.streamId = opts.streamId
    this.totalReceived = opts.totalReceived
  }

  static fromBuffer (receipt: Buffer, seed: Buffer): Receipt {
    const reader = Reader.from(receipt)
    if (reader.readUInt8Number() !== RECEIPT_VERSION) {
      throw new Error('invalid receipt version')
    }
    const nonce = reader.readOctetString(16)
    const streamId = reader.readUInt8()
    const totalReceived = reader.readUInt64Long()

    const receiptHmac = reader.readOctetString(32)
    const secret = generateReceiptSecret(seed, nonce)

    if (!receiptHmac.equals(hmac(secret, reader.buffer.slice(0, 26)))) {
      throw new Error('invalid receipt')
    }

    return new Receipt({
      nonce: nonce.toString('base64'),
      streamId,
      totalReceived
    })
  }
}
