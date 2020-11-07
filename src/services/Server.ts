import { Injector } from 'reduct'
import { Server as HttpServer } from 'http'
import * as Koa from 'koa'
import * as cors from '@koa/cors'
import * as Router from 'koa-router'
import { Redis } from './Redis'
import { Config } from './Config'
import { router as verifyRouter } from '../routes/verify'
import { router as spspRouter } from '../routes/spsp'

export class Server {
  private config: Config
  private redis: Redis
  private server: HttpServer

  constructor (deps: Injector) {
    this.config = deps(Config)
    this.redis = deps(Redis)
  }

  start (): void {
    const koa = new Koa()
    const router = new Router()

    koa.context.config = this.config
    koa.context.redis = this.redis

    koa.use(cors({
      allowHeaders: ['web-monetization-id']
    }))

    koa.use(verifyRouter.routes())
    koa.use(verifyRouter.allowedMethods())
    koa.use(spspRouter.routes())
    koa.use(spspRouter.allowedMethods())

    this.server = koa.listen(this.config.port, () => {
      if (process.env.NODE_ENV !== 'test') {
        console.log('Server listening on port: ' + this.config.port)
      }
    })
  }

  async stop (): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close(err => {
        if (err) {
          return reject(err)
        }
        resolve()
      })
    })
  }
}
