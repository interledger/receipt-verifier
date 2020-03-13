# Receipt Verifier
> Manages [Interledger STREAM](https://interledger.org/rfcs/0029-stream/) receipts

STREAM receipts allow recipients or third parties to verify received payments at the recipient's Interledger wallet.

The **Receipt Verifier**:

1. pre-shares a secret key with the receiving wallet for generating receipts, by acting as a proxy for SPSP queries to the recipient's payment pointer
2. verifies receipts
3. tracks balances where receipt amounts are credited

For [Web Monetization](https://github.com/interledger/rfcs/blob/master/0028-web-monetization/0028-web-monetization.md), website visitors submit receipts to the website in `monetizationprogress` events. The website backend can send receipts to the **Receipt Verifier** to credit the balance for the particular Monetization ID and can subsequently spend against the Monetization ID balance as desired to confirm the payment.

### Environment Variables

#### RECEIPT_SEED
* Type: String
* Description: Base64-encoded secret value used to generate receipt secret keys.
* Default: random seed

#### RECEIPT_TTL
* Type: [Number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)
* Description: The number of seconds since a stream's start time to consider a receipt valid.
* Default: 300

#### SPSP_ENDPOINT
* Type: String
* Description: The receiver's [SPSP endpoint](https://interledger.org/rfcs/0009-simple-payment-setup-protocol/) to which SPSP queries are proxied.

#### SPSP_PROXY_PORT
* Type: [Number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)
* Description: The port that SPSP proxy will listen on.
* Default: 3001

#### VERIFIER_PORT
* Type: [Number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)
* Description: The port that Receipt Verifier API will listen on.
* Default: 3000

### API Documentation

#### `POST /balances/{ID}:creditReceipt`
Verifies receipt and credits the receipt value to the specified balance

##### Request Body:
* Type: String
* Description: base64-encoded STREAM receipt

##### Return Value:
* Type: String
* Description: updated balance for `ID`

#### `POST /balances/{ID}:spend`
Debits an amount from the specified balance if the balance is sufficient

##### Request Body:
* Type: String
* Description: amount to debit the balance

##### Return Value:
* Type: String
* Description: updated balance for `ID`
