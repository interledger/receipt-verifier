import reduct from 'reduct'
import fetch from 'node-fetch'
import { createServer, Server } from 'http'
import { App } from './App'
import { Config } from './Config'

describe('SPSP', () => {
  let app: App
  let config: Config
  let targetServer: Server
  const targetResp = 'Hello SPSP!'

  beforeAll(() => {
    targetServer = createServer(function (req, res) {
      res.write(targetResp)
      res.end()
    }).listen()
    const address = targetServer.address()
    if (address && typeof address === 'object') {
      process.env.SPSP_ENDPOINT = `http://localhost:${address.port}`
    }
    const deps = reduct()
    app = deps(App)
    config = deps(Config)
    app.start()
  })

  afterAll(async (done) => {
    targetServer.close()
    await app.stop(done)
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

    it('proxies request to specified SPSP endpoint', async () => {
      const resp = await fetch(`http://localhost:${config.port}/.well-known/pay`, {
        headers: {
          Accept: 'application/spsp4+json'
        }
      })
      expect(resp.status).toBe(200)
      const body = await resp.text()
      expect(body).toBe(targetResp)
    })
  })
})
