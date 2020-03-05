import reduct from 'reduct'
import fetch from 'node-fetch'
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

  afterAll((done) => {
    app.stop(done)
  })

  describe('GET /.well-known/pay', () => {
    it('requires spsp4 header', async () => {
      const resp = await fetch(`http://localhost:${config.port}/.well-known/pay`, {
        headers: {
          Accept: 'application/json'
        }
      })
      expect(resp.ok).toBeFalsy()
      expect(resp.status).toBe(404)
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
