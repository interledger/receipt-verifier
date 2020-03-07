import reduct from 'reduct'
import fetch from 'node-fetch'
import * as Long from 'long'
import { Writer } from 'oer-utils'
import * as raw from 'raw-body'
import { App } from './App'
import { Config } from './Config'
import { generateReceiptSecret, hmac } from '../util/crypto'

describe('Balances', () => {
  let app: App
  let config: Config

  beforeEach(async () => {
    const deps = reduct()
    app = deps(App)
    config = deps(Config)
    await app.start()
  })

  afterEach((done) => {
    app.stop(done)
  })

  function makeReceipt(amount: Long, seed: Buffer, streamId = 1): string {
    const nonce = Buffer.alloc(16)
    const totalReceived = amount
    const streamStartTime = Long.fromNumber(Math.floor(Date.now() / 1000), true)

    const data = new Writer(33)
    data.writeOctetString(nonce, 16)
    data.writeUInt8(streamId)
    data.writeUInt64(totalReceived)
    data.writeUInt64(streamStartTime)
    const receiptData = data.getBuffer()

    const secret = generateReceiptSecret(seed, nonce)
    const receiptBuf = new Writer(65)
    receiptBuf.writeOctetString(hmac(secret, receiptData), 32)
    receiptBuf.writeOctetString(receiptData, 33)
    return receiptBuf.getBuffer().toString('base64')
  }

  describe('POST /balances/{id}:creditReceipt', () => {
    it('returns balance for valid receipt', async () => {
      const id = 'id'
      const amount = Long.fromNumber(10, true)
      const receipt = makeReceipt(amount, config.receiptSeed)
      const resp = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt
      })
      expect(resp.status).toBe(200)
      const balance = await resp.text()
      expect(balance).toStrictEqual(amount.toString())
    })

    it('returns updated balance for subsequent receipt', async () => {
      const id = 'id'
      const amount1 = Long.fromNumber(10, true)
      const receipt1 = makeReceipt(amount1, config.receiptSeed)
      const amount2 = Long.fromNumber(15, true)
      const receipt2 = makeReceipt(amount2, config.receiptSeed)

      const resp1 = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt1
      })
      expect(resp1.status).toBe(200)

      const resp2 = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt2
      })
      expect(resp2.status).toBe(200)
      const balance = await resp2.text()
      expect(balance).toStrictEqual(amount2.toString())
    })

    it('returns 400 for invalid receipt', async () => {
      const id = 'id'
      const amount = Long.fromNumber(10, true)
      const badSeed = Buffer.alloc(32)
      const receipt = makeReceipt(amount, badSeed)
      const resp = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt
      })
      expect(resp.status).toBe(400)
      const error = await resp.text()
      expect(error).toBe('invalid receipt')
    })

    it('returns 400 for expired receipt', async () => {
      const receiptTime = new Date('2000-01-01T00:00:00.000Z')
      jest.spyOn(global.Date, 'now')
      .mockImplementationOnce(() =>
        receiptTime.valueOf()
      )
      const id = 'id'
      const amount = Long.fromNumber(10, true)
      const receipt = makeReceipt(amount, config.receiptSeed)
      const now = receiptTime.valueOf() + (config.receiptTTLSeconds * 1000)
      jest.spyOn(global.Date, 'now')
      .mockImplementationOnce(() =>
        now
      )
      const resp = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt
      })
      expect(resp.status).toBe(400)
      const error = await resp.text()
      expect(error).toBe('expired receipt')

      jest.clearAllMocks()
    })

    it('returns 400 for receipt with lower amount', async () => {
      const id = 'id'
      const amount1 = Long.fromNumber(15, true)
      const receipt1 = makeReceipt(amount1, config.receiptSeed)
      const amount2 = Long.fromNumber(10, true)
      const receipt2 = makeReceipt(amount2, config.receiptSeed)

      const resp1 = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt1
      })
      expect(resp1.status).toBe(200)

      const resp2 = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt2
      })
      expect(resp2.status).toBe(400)
      const error = await resp2.text()
      expect(error).toBe('expired receipt')
    })

    it('returns 413 for receipt amount greater than MAX_SAFE_INTEGER', async () => {
      const id = 'id'
      const amount = Long.fromNumber(Number.MAX_SAFE_INTEGER, true).add(1)
      const receipt = makeReceipt(amount, config.receiptSeed)
      const resp = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt
      })
      expect(resp.status).toBe(413)
      const error = await resp.text()
      expect(error).toBe('receipt amount exceeds MAX_SAFE_INTEGER')
    })

    it.skip('returns 413 for balance amount greater than MAX_SAFE_INTEGER', async () => {
      // submit 1025 MAX_SAFE_INTEGER receipts. or preset redis value from here
      // the last one should return "ERR increment or decrement would overflow"
      // ioredi-mock won't throw...
    })
  })

  describe('POST /balances/{id}:spend', () => {

    it('returns new balance after spend', async () => {
      const id = 'id'
      const amount = Long.fromNumber(10, true)
      const receipt = makeReceipt(amount, config.receiptSeed)
      const resp1 = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt
      })
      expect(resp1.status).toBe(200)
      const spendAmount = Long.fromNumber(2, true)
      const resp2 = await fetch(`http://localhost:${config.port}/balances/${id}:spend`, {
        method: 'POST',
        body: spendAmount.toString()
      })
      expect(resp2.status).toBe(200)
      const balance = await resp2.text()
      expect(balance).toStrictEqual(amount.subtract(spendAmount).toString())
    })

    // ioredit-mock won't throw
    it.skip('returns 404 for unknown balance id', async () => {
      const id = 'unknown'
      const resp = await fetch(`http://localhost:${config.port}/balances/${id}:spend`, {
        method: 'POST',
        body: '1'
      })
      expect(resp.status).toBe(404)
      const error = await resp.text()
      expect(error).toBe('balance does not exist')
    })

    // ioredit-mock won't throw
    it.skip('returns 413 for insufficient balance', async () => {
      const id = 'id'
      const amount = Long.fromNumber(10, true)
      const receipt = makeReceipt(amount, config.receiptSeed)
      const resp1 = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt
      })
      expect(resp1.status).toBe(200)
      const spendAmount = Long.fromNumber(20, true)
      const resp2 = await fetch(`http://localhost:${config.port}/balances/${id}:spend`, {
        method: 'POST',
        body: spendAmount.toString()
      })
      expect(resp2.status).toBe(409)
      const error = await resp2.text()
      expect(error).toBe('insufficient balance')
    })
  })
})
