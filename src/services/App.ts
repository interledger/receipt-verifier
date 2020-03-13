import { Injector } from 'reduct'
import { Balances } from './Balances'
import { SPSP } from './SPSP'

export class App {
  private balances: Balances
  private spsp: SPSP

  constructor (deps: Injector) {
    this.balances = deps(Balances)
    this.spsp = deps(SPSP)
  }

  start (): void {
    this.balances.start()
    this.spsp.start()
  }

  async stop (): Promise<void> {
    await this.balances.stop()
    this.spsp.stop()
  }
}
