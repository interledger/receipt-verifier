import reduct from 'reduct'
import { Config } from './Config'

describe('Config', () => {
  describe('constructor', () => {
    it('requires SPSP_ENDPOINT or SPSP_ENDPOINTS_URL', () => {
      try {
        reduct()(Config)
        fail()
      } catch (err) {
        expect(err.message).toBe('receipt-verifier requires SPSP_ENDPOINT or SPSP_ENDPOINTS_URL to be set')
      }
    })

    it('disallows both SPSP_ENDPOINT and SPSP_ENDPOINTS_URL', () => {
      try {
        process.env.SPSP_ENDPOINT = 'http://localhost:3000'
        process.env.SPSP_ENDPOINTS_URL = 'https://spsp-endpoints.net'
        reduct()(Config)
        fail()
      } catch (err) {
        expect(err.message).toBe('SPSP_ENDPOINT and SPSP_ENDPOINTS_URL are mutually exclusive')
      }
    })
  })
})
