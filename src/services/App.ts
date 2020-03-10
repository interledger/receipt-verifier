import { Injector } from 'reduct'
import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import * as Koa from 'koa'
import * as Router from 'koa-router'
import * as url from 'url'
import { Balances } from './Balances'
import { Config } from './Config'
import { Redis } from './Redis'
import { SPSP } from './SPSP'

export class App {
  private balances: Balances
  private config: Config
  private redis: Redis
  private spsp: SPSP
  private server: Server

  constructor (deps: Injector) {
    this.balances = deps(Balances)
    this.config = deps(Config)
    this.redis = deps(Redis)
    this.spsp = deps(SPSP)
  }

  start (): void {
    this.redis.start()

    const koa = new Koa()
    const router = new Router()
    this.balances.start(router)
    koa.use(router.middleware())

    this.server = createServer(function (req: IncomingMessage, res: ServerResponse) {
      const path = req.url && url.parse(req.url).pathname
      if (path && /\/\.well-known\/pay$/.test(path) &&
          req.headers.accept && req.headers.accept.indexOf('application/spsp4+json') !== -1) {
        return this.spsp.proxy(req, res)
      }
      return koa.callback()(req, res)
    }.bind(this)).listen(this.config.port)

    if (process.env.NODE_ENV !== 'test') {
      console.log('App listening on port: ' + this.config.port)
    }
  }

  stop (callback: any): void {
    if (this.server) {
      this.server.close(callback)
    }
    this.spsp.close()
  }
}
