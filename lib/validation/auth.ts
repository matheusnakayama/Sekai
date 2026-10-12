import { z } from "zod";

export const emailInputSchema = z
  .string()
  .trim()
  .min(3)
  .max(320)
  .email()
  .transform((email) => email.toLowerCase());

export const passwordInputSchema = z.string().min(12).max(128);

export const loginInputSchema = z.object({
  email: emailInputSchema,
  password: z.string().min(1).max(256),
  captchaToken: z.string().min(1).max(4096),
  honeypot: z.string().max(200).optional().default(""),
});

export const signupInputSchema = z.object({
  email: emailInputSchema,
  password: passwordInputSchema,
  username: z.string().trim().transform((value) => value.replace(/^@/, "").toLowerCase())
    .pipe(z.string().min(2).max(32).regex(/^[a-z0-9_.-]+$/)),
  displayName: z.string().trim().max(50).optional().default(""),
  captchaToken: z.string().min(1).max(4096),
  honeypot: z.string().max(200).optional().default(""),
});

export const recoveryInputSchema = z.object({
  email: emailInputSchema,
  captchaToken: z.string().min(1).max(4096),
  honeypot: z.string().max(200).optional().default(""),
});

export const honeypotEventSchema = z.object({
  action: z.enum(["signup", "signin", "recovery"]),
  honeypot: z.string().trim().min(1).max(200),
});

export const passwordUpdateSchema = z.object({
  password: passwordInputSchema,
  confirmPassword: z.string().min(12).max(128),
}).refine((input) => input.password === input.confirmPassword, {
  path: ["confirmPassword"],
  message: "As senhas não coincidem.",
});

export const totpCodeSchema = z.string().trim().regex(/^\d{6,8}$/);
