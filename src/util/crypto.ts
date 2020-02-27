export { randomBytes } from 'crypto'
import * as crypto from 'crypto'

const RECEIPT_SECRET_GENERATION_STRING = Buffer.from('receipt_secret', 'utf8')
const HASH_ALGORITHM = 'sha256'

export function hmac (key: Buffer, message: Buffer): Buffer {
  const h = crypto.createHmac(HASH_ALGORITHM, key)
  h.update(message)
  return h.digest()
}

export function generateReceiptSecret (seed: Buffer, nonce: Buffer): Buffer {
  const keygen = hmac(seed, RECEIPT_SECRET_GENERATION_STRING)
  return hmac(keygen, nonce)
}
