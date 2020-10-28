# Receipt Verifier
> Manages [Interledger STREAM](https://interledger.org/rfcs/0029-stream/) receipts

[![npm version](https://badge.fury.io/js/%40coil%2Freceipt-verifier.svg)](https://badge.fury.io/js/%40coil%2Freceipt-verifier)
![](https://github.com/wilsonianb/receipt-verifier/workflows/Node.js%20CI/badge.svg)

STREAM receipts allow recipients or third parties to verify received payments at the recipient's Interledger wallet.

The **Receipt Verifier**:

1. pre-shares a secret key with the receiving wallet for generating receipts, by acting as a proxy for SPSP queries to the recipient's payment pointer
2. verifies receipts

SPSP queries are proxied to the URL encoded [payment pointer](https://paymentpointers.org/) or [SPSP endpoint](https://interledger.org/rfcs/0009-simple-payment-setup-protocol/) in the path of the SPSP request URL (unless [`SPSP_ENDPOINTS_URL`](#spsp_endpoints_url) is configured).

For [Web Monetization](https://github.com/interledger/rfcs/blob/master/0028-web-monetization/0028-web-monetization.md), website visitors submit receipts to the website in `monetizationprogress` events. The website backend can send receipts to the **Receipt Verifier** to confirm the payment.

### Run

```
npm install
sudo docker run -p 6379:6379 -d redis
npm start
```

### Environment Variables

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

* Example: if `SPSP_ENDPOINTS_URL=https://my-revshare.com`, an SPSP query to `https://my-receipt-verifier.com/users/alice` triggers a GET request to `https://my-revshare.com/?id=users%2Falice`. The receipt verifier proxies the SPSP query to the `spspEndpoint` in the response.

#### SPSP_PROXY_PORT
* Type: [Number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)
* Description: The port that SPSP proxy will listen on.
* Default: 3001

#### VERIFIER_PORT
* Type: [Number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)
* Description: The port that Receipt Verifier API will listen on.
* Default: 3000

### API Documentation

#### `POST /receipts`
Verifies receipt and returns decoded values

##### Request Body:
* Type: String
* Description: base64-encoded STREAM receipt

##### Return Value:
* Type: Object

| Field Name   | Type   | Description              |
|--------------|--------|--------------------------|
| amount       | string | Amount by which this receipt exceeds the previously verified receipt's `totalReceived` |
| spspEndpoint | string | SPSP endpoint to which the payment was sent |
