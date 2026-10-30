import assert from "node:assert/strict";
import test from "node:test";
import { decideShipmentAction, shipmentEventSchema } from "../src/shipment_decision.js";

test("an address mismatch opens an exception case for the agent", () => {
  const event = shipmentEventSchema.parse({
    shipmentId: "SHP-2048",
    eventId: "3f91492f-76d3-46cd-a3f7-8758b1755530",
    status: "exception",
    occurredAt: "2026-09-22T08:30:00.000Z",
    location: "Shanghai sorting center",
    exception: {
      code: "address_mismatch",
      note: "Postal code does not match the destination label"
    }
  });

  assert.deepEqual(decideShipmentAction(event), {
    action: "open_exception_case",
    needsAgent: true
  });
});

test("a delivered shipment without proof is rejected at the request boundary", () => {
  const result = shipmentEventSchema.safeParse({
    shipmentId: "SHP-2049",
    eventId: "239088a7-4830-4450-b058-f5552490e583",
    status: "delivered",
    occurredAt: "2026-09-22T08:35:00.000Z",
    location: "Customer reception"
  });

  assert.equal(result.success, false);
});
