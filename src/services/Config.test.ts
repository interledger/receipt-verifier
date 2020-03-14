import reduct from 'reduct'
import { Config } from './Config'

describe('Config', () => {
  describe('constructor', () => {
    it('construct new Redis service', () => {
      try {
        reduct()(Config)
        fail()
      } catch (err) {
        expect(err.message).toBe('receipt-verifier requires SPSP_ENDPOINT to be set')
      }
    })
  })
})
