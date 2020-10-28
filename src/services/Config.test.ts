import reduct from 'reduct'
import { Config } from './Config'

describe('Config', () => {
  describe('constructor', () => {
    it('accepts optional RECEIPT_SEED', () => {
      process.env.RECEIPT_SEED = 'NeuPwFvsXwpp+1HzBLDzmfHZAW5Qrf3DR2NWEPwZmJg='
      reduct()(Config)
    })
  })
})
