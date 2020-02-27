import reduct from 'reduct'
import axios from 'axios'
import { App } from './App'
import { Config } from './Config'

describe('Balances', () => {
  let app: App
  let config: Config

  beforeAll(async () => {
    const deps = reduct()
    app = deps(App)
    config = deps(Config)
    await app.start()
  })

  afterAll(() => {
    app.stop()
  })

  describe('POST /balances/{id}:creditReceipt', () => {
    it('returns 200', async () => {
      const id = 'id'
      const resp = await axios.post(`http://localhost:${config.port}/balances/${id}:creditReceipt`, {
        receipt: {
          amount: 10
        }
      })
      expect(resp.status).toBe(200)
    })

  })

  describe('POST /balances/{id}:spend', () => {
    it('returns 200', async () => {
      const id = 'id'
      const resp = await axios.post(`http://localhost:${config.port}/balances/${id}:spend`, {
        amount: 10
      })
      expect(resp.status).toBe(200)
    })

  })
})
