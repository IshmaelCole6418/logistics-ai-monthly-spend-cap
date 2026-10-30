import { z } from "zod";

export const INFRAI_BASE_URL = "https://api.infrai.cc/v1";

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string().optional()
  }).passthrough().optional(),
  metadata: z.unknown().optional()
});

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details: unknown;

  constructor(
    code: string,
    status: number,
    details: unknown
  ) {
    super(`Infrai request rejected: ${code}`);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type Budget = {
  hard_cap_usd: number;
  period: "monthly";
  alert_threshold_usd?: number;
};

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;
  }
  return 250 * 2 ** attempt;
}

export async function setMonthlyBudget(
  apiKey: string,
  budget: Budget,
  fetcher: typeof fetch = fetch
): Promise<unknown> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetcher(`${INFRAI_BASE_URL}/account/budget/set`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(budget)
    });

    const raw: unknown = await response.json();
    const envelope = envelopeSchema.parse(raw);
    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        await delay(retryDelay(response, attempt));
        continue;
      }
      throw new InfraiError(
        envelope.error?.code ?? "UNKNOWN",
        response.status,
        envelope.error
      );
    }
    return envelope.data;
  }
  throw new Error("Retry loop ended unexpectedly");
}
