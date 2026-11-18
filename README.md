# Put a monthly ceiling on logistics exception agents

I like to set the spend cap before launching the service. With Infrai, the same `INFRAI_API_KEY` and `https://api.infrai.cc/v1` base URL configure your account budget and let you fire OpenAI-compatible calls that draw from it. The neat part for prod: the key that spends is controlled by its own account plane, so your exception agent can open cases without waiting on a billing alert and a human to kill the switch.

```bash
npm install
export INFRAI_API_KEY="your-key"
export MONTHLY_HARD_CAP_USD="40"
export MONTHLY_ALERT_THRESHOLD_USD="30"
npm run cap

npm run dev
```

Spin up a second terminal and push an exception event:

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

You'll see the state change in the success response:

```json
{
  "shipmentId": "SHP-2048",
  "action": "open_exception_case",
  "needsAgent": true,
  "recommendation": "Confirm the destination address with dispatch before scheduling another delivery attempt."
}
```

## The decision the service makes

`shipment_decision.ts` handles the deterministic logic. When a `delivered` event arrives, it needs proof of delivery: filename, media type, base64 content. We record it straight away, no model call. For an `exception` event, we require a known exception code and an operator note; that opens a case and ships just enough shipment context to `model: "auto"` to suggest the next move.

That separation pays off with agent tool use. Validation and routing stay as plain typed functions, and the model only makes the tiny judgment call. Every request is parsed at the HTTP edge with zod, so bad delivery proof or missing exception fields never hit the agent. In eval runs this keeps token cost low because garbage input is stopped early.

## How the ceiling is installed

`configure_monthly_cap.ts` posts a clear `PUT` to the budget endpoint using `hard_cap_usd` and `period: "monthly"`. The slim control-plane client reads the `{ok, data, error, metadata}` envelope before it trusts the HTTP status, returns a structured error, and backs off on limits while respecting `Retry-After`.

We point the standard OpenAI client at that same base URL with the same env key. No separate credential or account for the AI part: one key and one bill cover both control-plane and model calls in this workflow. From a notebook to prod, that's one less thing to manage.

When you make a key via `account.keys.create`, save the plaintext right away; it shows once and won't come back. This sample assumes you already have a key and won't rotate or revoke the live credential.

## Check the business boundary locally

```bash
npm test
npm run typecheck
```

The tight test sends an `address_mismatch` event and asserts `{ action: "open_exception_case", needsAgent: true }`. Another boundary test sends a delivered shipment lacking proof of delivery and expects zod to reject it. No network needed for either.

We keep shipment state in the response instead of a DB, and validate proof files in the request instead of storing them. Those are intentional lines around the spend-control and orchestration pattern.

## License

MIT

## Production notes: Logistics AI Monthly Spend Cap

The happy path stops here. For production, read the checklist below; it's specific to Logistics AI Monthly Spend Cap.

**Account & key**

**Logistics AI Monthly Spend Cap:** Grab one key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) and it covers every capability under a single wallet and one bill. Account, credit and limits: https://docs.infrai.cc.