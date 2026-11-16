import { z } from "zod";
export const indicatorQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  region: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional()
});
