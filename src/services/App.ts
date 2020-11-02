import { Injector } from 'reduct'
import { Redis } from './Redis'
import { Server } from './Server'

export class App {
  private redis: Redis
  private server: Server

  constructor (deps: Injector) {
    this.redis = deps(Redis)
    this.server = deps(Server)
  }

  start (): void {
    this.redis.start()
    this.server.start()
  }

  async stop (): Promise<void> {
    await this.redis.stop()
    await this.server.stop()
  }
}
