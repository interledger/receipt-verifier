import { Receipt } from './Receipt'
import * as Long from 'long'
import { Writer } from 'oer-utils'
import { generateReceiptSecret, hmac } from '../util/crypto'

describe('Receipt', () => {
  describe('constructor', () => {
    it('constructs new Receipt', () => {
      const id = '123'
      const totalReceived = Long.fromNumber(1000, true)
      const streamStartTime = Long.fromNumber(Math.floor(Date.now() / 1000), true)

      const receipt = new Receipt({
        id,
        totalReceived,
        streamStartTime
      })

      expect(receipt.id).toBe(id)
      expect(receipt.totalReceived).toEqual(totalReceived)
      expect(receipt.streamStartTime).toEqual(streamStartTime)
    })
  })

  describe('fromBuffer', () => {
    const seed = Buffer.alloc(32)
    const nonce = Buffer.alloc(16)
    const streamId = 1
    const totalReceived = Long.fromNumber(1000, true)
    const streamStartTime = Long.fromNumber(Math.floor(Date.now() / 1000), true)

    const data = new Writer(33)
    data.writeOctetString(nonce, 16)
    data.writeUInt8(streamId)
    data.writeUInt64(totalReceived)
    data.writeUInt64(streamStartTime)
    const receiptData = data.getBuffer()

    it('creates new Receipt', () => {
      const secret = generateReceiptSecret(seed, nonce)
      const receiptBuf = new Writer(65)
      receiptBuf.writeOctetString(hmac(secret, receiptData), 32)
      receiptBuf.writeOctetString(receiptData, 33)

      const receipt = Receipt.fromBuffer(receiptBuf.getBuffer(), seed)
      expect(receipt.id).toBe(`${nonce}:${streamId}`)
      expect(receipt.totalReceived).toEqual(totalReceived)
      expect(receipt.streamStartTime).toEqual(streamStartTime)
    })

    it('throws if the receipt is invalid', () => {
      const receiptBuf = new Writer(65)
      // invalid hmac
      receiptBuf.writeOctetString(Buffer.alloc(32), 32)
      receiptBuf.writeOctetString(receiptData, 33)

      // function invalidFromBuffer() {
      //   Receipt.fromBuffer(receiptBuf.getBuffer(), seed)
      // }

      // expect(invalidFromBuffer).toThrowError(new Error('invalid receipt'))

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
        totalReceived: Long.fromNumber(1000, true),
        streamStartTime: Long.fromNumber(Math.floor(streamTime.valueOf() / 1000), true)
      })

      jest.spyOn(global.Date, 'now')
      .mockImplementationOnce(() =>
        now.valueOf()
      )

      expect(receipt.getRemainingTTL(90)).toBe(30)
    })

    it('returns 0 if receipt is invalid', () => {
      const streamTime = new Date('2000-01-01T00:00:00.000Z')
      const now        = new Date('2000-01-01T00:01:00.000Z')
      const receipt = new Receipt({
        id: '123',
        totalReceived: Long.fromNumber(1000, true),
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
