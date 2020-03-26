import { Receipt, RECEIPT_VERSION } from './Receipt'
import * as Long from 'long'
import { Writer } from 'oer-utils'
import { generateReceiptSecret, hmac } from '../util/crypto'

describe('Receipt', () => {
  describe('constructor', () => {
    it('constructs new Receipt', () => {
      const nonce = '123'
      const streamId = '1'
      const totalReceived = Long.fromNumber(1000)

      const receipt = new Receipt({
        nonce,
        streamId,
        totalReceived
      })

      expect(receipt.nonce).toBe(nonce)
      expect(receipt.totalReceived.compare(totalReceived)).toBe(0)
    })
  })

  describe('fromBuffer', () => {
    const seed = Buffer.alloc(32)
    const nonce = Buffer.alloc(16)
    const streamId = '1'
    const totalReceived = Long.fromNumber(1000)

    function makeReceiptData(version = RECEIPT_VERSION): Buffer {
      const data = new Writer(26)
      data.writeUInt8(version)
      data.writeOctetString(nonce, 16)
      data.writeUInt8(streamId)
      data.writeUInt64(totalReceived.toUnsigned())
      return data.getBuffer()
    }

    it('creates new Receipt', () => {
      const secret = generateReceiptSecret(seed, nonce)
      const receiptBuf = new Writer(58)
      const receiptData = makeReceiptData()
      receiptBuf.writeOctetString(receiptData, 26)
      receiptBuf.writeOctetString(hmac(secret, receiptData), 32)

      const receipt = Receipt.fromBuffer(receiptBuf.getBuffer(), seed)
      expect(receipt.nonce).toBe(nonce.toString('base64'))
      expect(receipt.streamId).toBe(streamId)
      expect(receipt.totalReceived.compare(totalReceived)).toBe(0)
    })

    it('throws if the receipt version is invalid', () => {
      const secret = generateReceiptSecret(seed, nonce)
      const receiptBuf = new Writer(58)
      const badVersion = 2
      const receiptData = makeReceiptData(badVersion)
      receiptBuf.writeOctetString(receiptData, 26)
      receiptBuf.writeOctetString(hmac(secret, receiptData), 32)

      try {
        Receipt.fromBuffer(receiptBuf.getBuffer(), seed)
        fail()
      } catch (error) {
        expect(error.message).toBe('invalid receipt version')
      }
    })

    it('throws if the receipt is invalid', () => {
      const receiptBuf = new Writer(58)
      receiptBuf.writeOctetString(makeReceiptData(), 26)
      // invalid hmac
      receiptBuf.writeOctetString(Buffer.alloc(32), 32)

      try {
        Receipt.fromBuffer(receiptBuf.getBuffer(), seed)
        fail()
      } catch (error) {
        expect(error.message).toBe('invalid receipt')
      }
    })
  })
})
