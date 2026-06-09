import { z } from 'zod';

const passwordMin = 8;

export const SigninSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type SigninInput = z.infer<typeof SigninSchema>;

export const SignupSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(passwordMin),
});
export type SignupInput = z.infer<typeof SignupSchema>;

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  newPassword: z.string().min(passwordMin),
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
