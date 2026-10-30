import { z } from "zod";

export const shipmentEventSchema = z.object({
  shipmentId: z.string().min(1),
  eventId: z.string().uuid(),
  status: z.enum(["delivered", "exception"]),
  occurredAt: z.string().datetime(),
  location: z.string().min(1),
  proofOfDelivery: z.object({
    filename: z.string().min(1),
    mediaType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
    contentBase64: z.string().min(1)
  }).optional(),
  exception: z.object({
    code: z.enum(["damaged", "recipient_unavailable", "address_mismatch"]),
    note: z.string().min(1)
  }).optional()
}).superRefine((event, context) => {
  if (event.status === "delivered" && !event.proofOfDelivery) {
    context.addIssue({ code: "custom", message: "Delivered events require proof of delivery" });
  }
  if (event.status === "exception" && !event.exception) {
    context.addIssue({ code: "custom", message: "Exception events require exception details" });
  }
});

export type ShipmentEvent = z.infer<typeof shipmentEventSchema>;

export type ShipmentDecision =
  | { action: "record_delivery"; needsAgent: false }
  | { action: "open_exception_case"; needsAgent: true };

export function decideShipmentAction(event: ShipmentEvent): ShipmentDecision {
  return event.status === "exception"
    ? { action: "open_exception_case", needsAgent: true }
    : { action: "record_delivery", needsAgent: false };
}
