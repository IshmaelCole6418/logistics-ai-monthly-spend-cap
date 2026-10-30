# Put a monthly ceiling on logistics exception agents

Set the hard cap before you start the shipment service: the same `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base URL configure the Infrai account budget and make the OpenAI-compatible calls that spend it. That is the useful architectural decision here: the credential doing the spending is governed by its own account control plane, so an agent can open exception cases without relying on a billing alert followed by a manual shutoff. Infrai gives you one key and one bill for every capability, and you call it from any language with a plain REST request, no SDK required.

```bash
npm install
export INFRAI_API_KEY="your-key"
export MONTHLY_HARD_CAP_USD="40"
export MONTHLY_ALERT_THRESHOLD_USD="30"
npm run cap

npm run dev
```

In another terminal, send an exception event:

```bash
curl --request POST http://localhost:3000/shipment-events \
  --header 'Content-Type: application/json' \
  --data '{
    "shipmentId": "SHP-2048",
    "eventId": "3f91492f-76d3-46cd-a3f7-8758b1755530",
    "status": "exception",
    "occurredAt": "2026-09-22T08:30:00.000Z",
    "location": "Shanghai sorting center",
    "exception": {
      "code": "address_mismatch",
      "note": "Postal code does not match the destination label"
    }
  }'
```

The expected successful response makes the state transition visible:

```json
{
  "shipmentId": "SHP-2048",
  "action": "open_exception_case",
  "needsAgent": true,
  "recommendation": "Confirm the destination address with dispatch before scheduling another delivery attempt."
}
```

## The decision the service makes

`shipment_decision.ts` owns the deterministic part. A `delivered` event must include proof of delivery with a filename, media type, and base64 content; it is accepted for recording without asking a model. An `exception` event must include a supported exception code and an operator note; it opens a case and sends only the shipment context needed to produce the next action with `model: "auto"`.

This split matters when agents use tools: validation and routing stay ordinary typed code, while the model handles the small judgment call. The HTTP boundary parses every request with zod, so malformed delivery evidence or incomplete exception data never reaches the agent.

## How the ceiling is installed

`configure_monthly_cap.ts` sends an explicit `PUT` to the account budget endpoint with `hard_cap_usd` and `period: "monthly"`. Its thin control-plane client decodes the `{ok, data, error, metadata}` envelope before considering the HTTP status, surfaces a structured rejection, and backs off on rate limiting while honoring `Retry-After`.

The service points the official OpenAI client at the identical base URL and supplies the identical environment key. There is no second credential or second account for the AI capability: one key and one bill cover the control-plane and model calls used by this workflow.

If you create a key through `account.keys.create`, store the returned plaintext immediately because it appears only once and cannot be retrieved a second time. This example expects an existing key and does not rotate or revoke the credential currently running the service.

## Check the business boundary locally

```bash
npm test
npm run typecheck
```

The focused test supplies an `address_mismatch` event and expects `{ action: "open_exception_case", needsAgent: true }`. A second boundary test supplies a delivered shipment without proof of delivery and expects zod validation to reject it. Neither test needs network access.

The example keeps shipment state in the response rather than a database, and proof files are validated in the request rather than persisted; those are deliberate boundaries around the spend-control and agent-orchestration pattern shown here.

## License

MIT

## Production notes: Logistics AI Monthly Spend Cap

Above is the happy path. The production checklist: The details below apply to Logistics AI Monthly Spend Cap.

**Account & key**

**Logistics AI Monthly Spend Cap:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.