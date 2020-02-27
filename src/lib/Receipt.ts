import { Reader, Writer } from 'oer-utils'
import * as Long from 'long'
import { generateReceiptSecret, hmac } from '../util/crypto'

export interface ReceiptOpts {
  seed: Buffer,
  receipt: Buffer
}

export class Receipt {
  nonce: Buffer
  streamId: number
  totalReceived: Long
  streamStartTime: number
  hmac: Buffer

  constructor (opts: ReceiptOpts) {
    const reader = Reader.from(opts.receipt)
    this.nonce = reader.readVarOctetString()
    this.streamId = reader.readVarUIntNumber()
    this.totalReceived = reader.readVarUIntLong()
    this.streamStartTime = reader.readVarUIntNumber()
    this.hmac = reader.readVarOctetString()

    const writer = new Writer()
    writer.writeVarOctetString(this.nonce)
    writer.writeVarUInt(this.streamId)
    writer.writeVarUInt(this.totalReceived)
    writer.writeVarUInt(this.streamStartTime)
    const secret = generateReceiptSecret(opts.seed, this.nonce)
    if (this.hmac !== hmac(secret, writer.getBuffer())) {
      throw new Error('invalid receipt')
    }
  }
}
