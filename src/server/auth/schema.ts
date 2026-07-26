import { z } from "zod";

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(8).max(256),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
