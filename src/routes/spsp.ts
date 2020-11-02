import { randomBytes, generateReceiptSecret } from '../util/crypto'
import { IncomingMessage, ServerResponse } from 'http'
import fetch from 'node-fetch'
import * as Koa from 'koa'
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

export const router = new Router()

router.get('/(.*)', async (ctx: Koa.Context) => {
  if (ctx.accepts('application/spsp4+json') && ctx.req.url) {
    let spspEndpoint: string
    if (ctx.config.spspEndpointsUrl) {
      const id = encodeURIComponent(ctx.req.url.substring(1))
      const endpointsRes = await fetch(`${ctx.config.spspEndpointsUrl}?id=${id}`)
      if (endpointsRes.status !== 200) {
        console.error(await endpointsRes.text())
        ctx.throw(404)
      }
      spspEndpoint = await endpointsRes.text()
    } else {
      spspEndpoint = decodeURIComponent(ctx.req.url.substring(1))
    }
    const nonce = randomBytes(16)
    const secret = generateReceiptSecret(ctx.config.receiptSeed, nonce)
    ctx.proxyServer.once('proxyRes', function (proxyRes: IncomingMessage, req: IncomingMessage, res: ServerResponse) {
      const chunks: Buffer[] = []
      proxyRes.on('data', chunk => {
        chunks.push(chunk)
      })
      proxyRes.once('end', async () => {
        ctx.respond = true
        const body = Buffer.concat(chunks)
        try {
          const spspRes = JSON.parse(body.toString())
          if (spspRes.receipts_enabled) {
            // should this strip 'receipts_enabled'?
            await ctx.redis.cacheReceiptNonce(nonce.toString('base64'), spspEndpoint)
            res.writeHead(proxyRes.statusCode || 200, proxyRes.headers)
            res.end(body)
          } else {
            res.statusCode = 409
            res.end()
          }
        } catch (err) {
          res.statusCode = 409
          res.end()
        }
      })
    }.bind(this))
    ctx.respond = false
    ctx.proxyServer.web(ctx.req, ctx.res, {
      headers: {
        'Receipt-Nonce': nonce.toString('base64'),
        'Receipt-Secret': secret.toString('base64')
      },
      ignorePath: true,
      selfHandleResponse: true,
      target: resolvePointer(spspEndpoint)
    })
  }
})
