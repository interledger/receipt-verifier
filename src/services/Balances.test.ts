import reduct from 'reduct'
import fetch from 'node-fetch'
import * as Long from 'long'
import { Reader, Writer } from 'oer-utils'
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

  describe('POST /balances/{id}:creditReceipt', () => {

    function makeReceipt(amount: Long, seed: Buffer): Buffer {
      const nonce = Buffer.alloc(16)
      const streamId = 1
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
      return receiptBuf.getBuffer()
    }

    it('returns balance for valid receipt', async () => {
      const id = 'id'
      const amount = Long.fromNumber(10, true)
      const receipt = makeReceipt(amount, config.receiptSeed)
      const resp = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt,
        headers: { 'Content-Type': 'application/octet-stream' }
      })
      expect(resp.status).toBe(200)
      const respBuf = await resp.buffer()
      const reader = Reader.from(respBuf)
      const balance = reader.readUIntLong(respBuf.length)
      // const balance = Long.fromBytesBE(Array.prototype.slice.call(respBuf, 0), true)
      expect(balance).toStrictEqual(amount)
    })

    it('returns updated balance for subsequent receipt', async () => {
      const id = 'id'
      const amount1 = Long.fromNumber(10, true)
      const receipt1 = makeReceipt(amount1, config.receiptSeed)
      const amount2 = Long.fromNumber(15, true)
      const receipt2 = makeReceipt(amount2, config.receiptSeed)

      const resp1 = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt1,
        headers: { 'Content-Type': 'application/octet-stream' }
      })
      expect(resp1.status).toBe(200)

      const resp2 = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt2,
        headers: { 'Content-Type': 'application/octet-stream' }
      })
      expect(resp2.status).toBe(200)
      const respBuf = await resp2.buffer()
      const reader = Reader.from(respBuf)
      const balance = reader.readUIntLong(respBuf.length)
      expect(balance).toStrictEqual(amount2)
    })

    it('returns 400 for invalid receipt', async () => {
      const id = 'id'
      const amount = Long.fromNumber(10, true)
      const badSeed = Buffer.alloc(32)
      const receipt = makeReceipt(amount, badSeed)
      const resp = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt,
        headers: { 'Content-Type': 'application/octet-stream' }
      })
      expect(resp.status).toBe(400)
      const respBuf = await resp.buffer()
      expect(respBuf.toString()).toBe('invalid receipt')
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
        body: receipt,
        headers: { 'Content-Type': 'application/octet-stream' }
      })
      expect(resp.status).toBe(400)
      const respBuf = await resp.buffer()
      expect(respBuf.toString()).toBe('expired receipt')

      jest.clearAllMocks()
    })

    it('returns 400 for receipt with lower amount', async () => {
      const id = 'id'
      const amount1 = Long.fromNumber(15, true)
      const oldStreamTime = Math.floor(Date.now()/1000) - config.receiptTTLSeconds
      const receipt1 = makeReceipt(amount1, config.receiptSeed)
      const amount2 = Long.fromNumber(10, true)
      const receipt2 = makeReceipt(amount2, config.receiptSeed)

      const resp1 = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt1,
        headers: { 'Content-Type': 'application/octet-stream' }
      })
      expect(resp1.status).toBe(200)

      const resp2 = await fetch(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        method: 'POST',
        body: receipt2,
        headers: { 'Content-Type': 'application/octet-stream' }
      })
      expect(resp2.status).toBe(400)
      const respBuf = await resp2.buffer()
      expect(respBuf.toString()).toBe('expired receipt')
    })

    it('returns 500? for invalid receipt', async () => {
      // amount exceeds max int
    })
  })

  describe('POST /balances/{id}:spend', () => {
    // it('returns 200', async () => {
    //   const id = 'id'
    //   const resp = await fetch(`http://localhost:${config.port}/balances/${id}:spend`, {
    //     amount: 10
    //   })
    //   expect(resp.status).toBe(200)
    // })

  })
})
