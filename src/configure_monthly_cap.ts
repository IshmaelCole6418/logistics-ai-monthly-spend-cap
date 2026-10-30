import { z } from "zod";
import { setMonthlyBudget } from "./infrai_control.js";

const environmentSchema = z.object({
  INFRAI_API_KEY: z.string().min(1),
  MONTHLY_HARD_CAP_USD: z.coerce.number().positive(),
  MONTHLY_ALERT_THRESHOLD_USD: z.coerce.number().positive().optional()
});

const environment = environmentSchema.parse(process.env);
const result = await setMonthlyBudget(environment.INFRAI_API_KEY, {
  hard_cap_usd: environment.MONTHLY_HARD_CAP_USD,
  period: "monthly",
  ...(environment.MONTHLY_ALERT_THRESHOLD_USD === undefined
    ? {}
    : { alert_threshold_usd: environment.MONTHLY_ALERT_THRESHOLD_USD })
});

console.log("Monthly account budget configured", result);
