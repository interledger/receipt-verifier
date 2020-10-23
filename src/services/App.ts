import { Injector } from 'reduct'
import { Receipts } from './Receipts'
import { Redis } from './Redis'
import { SPSP } from './SPSP'

export class App {
  private receipts: Receipts
  private redis: Redis
  private spsp: SPSP

  constructor (deps: Injector) {
    this.receipts = deps(Receipts)
    this.redis = deps(Redis)
    this.spsp = deps(SPSP)
  }

  start (): void {
    this.redis.start()
    this.receipts.start()
    this.spsp.start()
  }

  async stop (): Promise<void> {
    this.receipts.stop()
    this.spsp.stop()
    await this.redis.stop()
  }
}
