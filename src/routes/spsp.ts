import { randomBytes, generateReceiptSecret } from '../util/crypto'
import { IncomingMessage, ServerResponse } from 'http'
import fetch from 'node-fetch'
import * as Koa from 'koa'
import * as proxy from 'koa-better-http-proxy'
import * as Router from 'koa-router'
import * as url from 'url'

function resolvePointer (pointer: string): string {
  if (!pointer.startsWith('$')) {
    return pointer
  }

  const protocol = (process.env.NODE_ENV === 'test') ? 'http://' : 'https://'
  const url = new URL(protocol + pointer.substring(1))
  if (url.pathname === '/') {
    url.pathname = '/.well-known/pay'
  }

  return url.href
}

const spspProxySetup = () => async (ctx: Koa.Context, next: Koa.Next) => {
  if (ctx.accepts('application/spsp4+json') && ctx.req.url) {
    if (ctx.config.spspEndpointsUrl) {
      const id = encodeURIComponent(ctx.req.url.substring(1))
      const endpointsRes = await fetch(`${ctx.config.spspEndpointsUrl}?id=${id}`)
      if (endpointsRes.status !== 200) {
        console.error(await endpointsRes.text())
        ctx.throw(404)
      }
      ctx.state.spspEndpoint = await endpointsRes.text()
    } else {
      ctx.state.spspEndpoint = decodeURIComponent(ctx.req.url.substring(1))
    }
    ctx.state.resolvedSpspEndpoint = resolvePointer(ctx.state.spspEndpoint)
    ctx.state.nonce = randomBytes(16)
    await next()
  }
}

export const router = new Router()

router.get('/(.*)',
  spspProxySetup(),
  proxy(
    // koa-better-http-proxy typings don't include supported function type for url
    // https://github.com/nsimmons/koa-better-http-proxy/issues/2
    // @ts-ignore
    (ctx: Koa.Context) => ctx.state.resolvedSpspEndpoint,
    {
      proxyReqOptDecorator: async (proxyReqOpts: proxy.IRequestOption, ctx: Koa.Context) => {
        proxyReqOpts.headers['Receipt-Nonce'] = ctx.state.nonce.toString('base64')
        proxyReqOpts.headers['Receipt-Secret'] = generateReceiptSecret(ctx.config.receiptSeed, ctx.state.nonce).toString('base64')

        return proxyReqOpts
      },
      proxyReqPathResolver: (ctx: Koa.Context) => {
        return new URL(ctx.state.resolvedSpspEndpoint).pathname
      },
      userResDecorator: async (proxyRes: IncomingMessage, proxyResData: Buffer, ctx: Koa.Context) => {
        const data = JSON.parse(proxyResData.toString())
        if (!data.receipts_enabled) {
          ctx.throw(409)
        }
        await ctx.redis.cacheReceiptNonce(ctx.state.nonce.toString('base64'), ctx.state.spspEndpoint)
        return proxyResData
      }
    }
  )
)
