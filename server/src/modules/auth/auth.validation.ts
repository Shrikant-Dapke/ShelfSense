import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("A valid email address is required"),
  password: z.string().min(1, "Password is required").max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be at most 100 characters"),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * Password policy for any flow that sets a new password. Intentionally
 * shared (not inline) so future flows — admin reset, onboarding — enforce
 * the same rules instead of growing a second weaker policy.
 */
export const newPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200, "Password must be at most 200 characters")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(200),
  newPassword: newPasswordSchema,
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
