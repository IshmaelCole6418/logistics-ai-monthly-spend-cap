import { createServer } from "node:http";
import OpenAI from "openai";
import { z } from "zod";
import { INFRAI_BASE_URL, InfraiError } from "./infrai_control.js";
import { decideShipmentAction, shipmentEventSchema } from "./shipment_decision.js";

const environment = z.object({
  INFRAI_API_KEY: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000)
}).parse(process.env);

const ai = new OpenAI({
  apiKey: environment.INFRAI_API_KEY,
  baseURL: INFRAI_BASE_URL,
  maxRetries: 3
});

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/shipment-events") {
    send(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const event = shipmentEventSchema.parse(await readJson(request));
    const decision = decideShipmentAction(event);
    if (!decision.needsAgent) {
      send(response, 202, { shipmentId: event.shipmentId, ...decision });
      return;
    }

    const completion = await ai.chat.completions.create({
      model: "auto",
      messages: [
        {
          role: "system",
          content: "You are a logistics exception agent. Return one concise next action for an operator."
        },
        {
          role: "user",
          content: JSON.stringify({
            shipmentId: event.shipmentId,
            location: event.location,
            exception: event.exception
          })
        }
      ]
    });
    send(response, 202, {
      shipmentId: event.shipmentId,
      ...decision,
      recommendation: completion.choices[0]?.message.content ?? "Review the exception case"
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      send(response, 400, { error: "Invalid shipment event", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      send(response, error.status >= 400 && error.status < 500 ? error.status : 502, {
        error: error.code,
        details: error.details
      });
      return;
    }
    if (error instanceof OpenAI.APIError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.code ?? "AI_REQUEST_REJECTED" });
      return;
    }
    send(response, 502, { error: "Unable to process shipment event" });
  }
});

server.listen(environment.PORT, () => {
  console.log(`Shipment event service listening on http://localhost:${environment.PORT}`);
});
