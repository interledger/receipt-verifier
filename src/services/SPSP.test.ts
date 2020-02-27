import reduct from 'reduct'
import axios from 'axios'
import { App } from './App'
import { Config } from './Config'

describe('SPSP', () => {
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

  describe('GET /.well-known/pay', () => {
    it('requires spsp4 header', async () => {
      try {
        await axios.get(`http://localhost:${config.port}/.well-known/pay`)
        fail()
      } catch (error) {
        expect(error.response.status).toBe(404)
      }
    })

    // it('returns ???', async () => {
    //   const resp = await axios.get(`http://localhost:${config.port}/.well-known/pay`, {
    //     headers: {
    //       accepts: 'application/spsp4+json'
    //     }
    //   })
    //   console.log(resp)
    // })

  })
})
