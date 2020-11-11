# Receipt Verifier
> Manages [Interledger STREAM](https://interledger.org/rfcs/0029-stream/) receipts

[![npm version](https://badge.fury.io/js/%40coil%2Freceipt-verifier.svg)](https://badge.fury.io/js/%40coil%2Freceipt-verifier)
![](https://github.com/wilsonianb/receipt-verifier/workflows/Node.js%20CI/badge.svg)

STREAM receipts allow recipients or third parties to verify received payments at the recipient's Interledger wallet.

The **Receipt Verifier**:

1. pre-shares a secret key with the receiving wallet for generating receipts, by acting as a proxy for SPSP queries to the recipient's payment pointer
2. verifies receipts

For [Web Monetization](https://github.com/interledger/rfcs/blob/master/0028-web-monetization/0028-web-monetization.md), website visitors submit receipts to the website in `monetizationprogress` events. The website backend can send receipts to the **Receipt Verifier** to confirm the payment.

### Run

```
npm install
npm run-script build
sudo docker run -p 6379:6379 -d redis
npm start
```

### Environment Variables

#### PORT
* Type: [Number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)
* Description: The port that Receipt Verifier API will listen on.
* Default: 3000

#### RECEIPT_SEED
* Type: String
* Description: Base64-encoded secret value used to generate receipt secret keys.
* Default: random seed

#### RECEIPT_TTL
* Type: [Number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)
* Description: The number of seconds since a stream's start time to consider a receipt valid.
* Default: 300

#### REDIS_URI
* Type: String
* Description: The URI at which to connect to Redis. Use `mock` for [in-memory Redis](https://www.npmjs.com/package/ioredis-mock) (NOT RECOMMENDED for production)
* Default: redis://127.0.0.1:6379/

#### SPSP_ENDPOINTS_URL
* Type: String
* Description: URL used to fetch a receiver's [SPSP endpoint](https://interledger.org/rfcs/0009-simple-payment-setup-protocol/) to which an SPSP query is proxied.
For each SPSP query, a GET request is sent to `SPSP_ENDPOINTS_URL` with the query's url path value (without the preceding slash) as the URI encoded `id` query parameter.
The response body is expected to be a string of the SPSP endpoint to proxy the SPSP query to.

### API Documentation

#### `GET /  Accept: application/spsp4+json`
Adds receipt headers to [SPSP request](https://interledger.org/rfcs/0009-simple-payment-setup-protocol/) and proxies it to the receiver's SPSP endpoint.

If [`SPSP_ENDPOINTS_URL`](#spsp_endpoints_url) is configured, the request is proxied to the SPSP endpoint returned by the `SPSP_ENDPOINTS_URL`.
* Example: if `SPSP_ENDPOINTS_URL=https://my-revshare.com`, `GET /users/alice` triggers a GET request to `https://my-revshare.com/?id=users%2Falice`. The SPSP request is then proxied to the SPSP endpoint in the response.

Otherwise, the SPSP query is proxied to the URL encoded [payment pointer](https://paymentpointers.org/) or SPSP endpoint in the path of the SPSP request URL.
* Example: `GET /%24wallet.com` (or `GET /https%3A%2F%2Fwallet.com%2F.well-known%2Fpay`) is proxied to `$wallet.com` (`https://wallet.com/.well-known/pay`).

#### `POST /verify`
Verifies receipt and returns value

##### Request Body:
* Type: String
* Description: base64-encoded STREAM receipt

##### Return Value:
* Type: Object

| Field Name   | Type   | Description              |
|--------------|--------|--------------------------|
| amount       | string | Amount by which this receipt exceeds the previously verified receipt's `totalReceived` |
| id           | string | _OPTIONAL_ The URI decoded `id` that was used in the request to the `SPSP_ENDPOINTS_URL` |
| spspEndpoint | string | SPSP endpoint to which the payment was sent |
