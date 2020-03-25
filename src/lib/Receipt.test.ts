import { Receipt, RECEIPT_VERSION } from './Receipt'
import * as Long from 'long'
import { Writer } from 'oer-utils'
import { generateReceiptSecret, hmac } from '../util/crypto'

describe('Receipt', () => {
  describe('constructor', () => {
    it('constructs new Receipt', () => {
      const id = '123'
      const totalReceived = Long.fromNumber(1000)
      const streamStartTime = Long.fromNumber(Math.floor(Date.now() / 1000), true)

      const receipt = new Receipt({
        id,
        totalReceived,
        streamStartTime
      })

      expect(receipt.id).toBe(id)
      expect(receipt.totalReceived.compare(totalReceived)).toBe(0)
      expect(receipt.streamStartTime).toEqual(streamStartTime)
    })
  })

  describe('fromBuffer', () => {
    const seed = Buffer.alloc(32)
    const nonce = Buffer.alloc(16)
    const streamId = 1
    const totalReceived = Long.fromNumber(1000)
    const streamStartTime = Long.fromNumber(Math.floor(Date.now() / 1000), true)

    function makeReceiptData(version = RECEIPT_VERSION): Buffer {
      const data = new Writer(34)
      data.writeUInt8(version)
      data.writeOctetString(nonce, 16)
      data.writeUInt8(streamId)
      data.writeUInt64(totalReceived.toUnsigned())
      data.writeUInt64(streamStartTime)
      return data.getBuffer()
    }

    it('creates new Receipt', () => {
      const secret = generateReceiptSecret(seed, nonce)
      const receiptBuf = new Writer(66)
      const receiptData = makeReceiptData()
      receiptBuf.writeOctetString(receiptData, 34)
      receiptBuf.writeOctetString(hmac(secret, receiptData), 32)

      const receipt = Receipt.fromBuffer(receiptBuf.getBuffer(), seed)
      expect(receipt.id).toBe(`${nonce}:${streamId}`)
      expect(receipt.totalReceived.compare(totalReceived)).toBe(0)
      expect(receipt.streamStartTime).toEqual(streamStartTime)
    })

    it('throws if the receipt version is invalid', () => {
      const secret = generateReceiptSecret(seed, nonce)
      const receiptBuf = new Writer(66)
      const badVersion = 2
      const receiptData = makeReceiptData(badVersion)
      receiptBuf.writeOctetString(receiptData, 34)
      receiptBuf.writeOctetString(hmac(secret, receiptData), 32)

      try {
        Receipt.fromBuffer(receiptBuf.getBuffer(), seed)
        fail()
      } catch (error) {
        expect(error.message).toBe('invalid receipt version')
      }
    })

    it('throws if the receipt is invalid', () => {
      const receiptBuf = new Writer(66)
      receiptBuf.writeOctetString(makeReceiptData(), 34)
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

  describe('getRemainingTTL', () => {
    it('returns number of seconds until receipt is no longer valid', () => {
      const streamTime = new Date('2000-01-01T00:00:00.000Z')
      const now        = new Date('2000-01-01T00:01:00.000Z')
      const receipt = new Receipt({
        id: '123',
        totalReceived: Long.fromNumber(1000),
        streamStartTime: Long.fromNumber(Math.floor(streamTime.valueOf() / 1000), true)
      })

      jest.spyOn(global.Date, 'now')
      .mockImplementationOnce(() =>
        now.valueOf()
      )

      expect(receipt.getRemainingTTL(90)).toBe(30)
    })

    it('returns number of seconds as an integer', () => {
      const streamTime = Date.now()
      const receipt = new Receipt({
        id: '123',
        totalReceived: Long.fromNumber(1000),
        streamStartTime: Long.fromNumber(Math.floor(streamTime.valueOf() / 1000), true)
      })

      const ttl = receipt.getRemainingTTL(90)
      expect(Number.isInteger(ttl)).toBeTruthy()
    })

    it('returns 0 if receipt is invalid', () => {
      const streamTime = new Date('2000-01-01T00:00:00.000Z')
      const now        = new Date('2000-01-01T00:01:00.000Z')
      const receipt = new Receipt({
        id: '123',
        totalReceived: Long.fromNumber(1000),
        streamStartTime: Long.fromNumber(Math.floor(streamTime.valueOf() / 1000), true)
      })

      jest.spyOn(global.Date, 'now')
      .mockImplementationOnce(() =>
        now.valueOf()
      )

      expect(receipt.getRemainingTTL(30)).toBe(0)
    })
  })
})
