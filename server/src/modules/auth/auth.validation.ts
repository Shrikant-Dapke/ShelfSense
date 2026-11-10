import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("A valid email address is required"),
  password: z.string().min(1, "Password is required").max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;
