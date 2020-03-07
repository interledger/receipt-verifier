import { Injector } from 'reduct'
import * as Koa from 'koa'
import * as Router from 'koa-router'
import { Server } from 'http'
import { Config } from './Config'
import { Balances } from './Balances'
import { Redis } from './Redis'
import { SPSP } from './SPSP'

export class App {
  private config: Config
  private balances: Balances
  private redis: Redis
  private spsp: SPSP
  private server: Server

  constructor (deps: Injector) {
    this.config = deps(Config)
    this.balances = deps(Balances)
    this.redis = deps(Redis)
    this.spsp = deps(SPSP)
  }

  // public start (): void {
  async start (): Promise<void> {
    this.redis.start()

    const koa = new Koa()
    const router = new Router()

    this.balances.start(router)
    this.spsp.start(router)
    koa.use(router.middleware())
    this.server = koa.listen(this.config.port)
  }

  stop (callback: any): void {
    if (this.server) {
      this.server.close(callback)
    }
  }
}
