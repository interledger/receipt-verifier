import { Injector } from 'reduct'
import { Balances } from './Balances'
import { Redis } from './Redis'
import { SPSP } from './SPSP'

export class App {
  private balances: Balances
  private redis: Redis
  private spsp: SPSP

  constructor (deps: Injector) {
    this.balances = deps(Balances)
    this.redis = deps(Redis)
    this.spsp = deps(SPSP)
  }

  start (): void {
    this.redis.start()
    this.balances.start()
    this.spsp.start()
  }

  async stop (): Promise<void> {
    this.balances.stop()
    this.spsp.stop()
    await this.redis.stop()
  }
}
