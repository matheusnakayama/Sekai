import test from "node:test";
import assert from "node:assert/strict";
import {
  emailInputSchema,
  honeypotEventSchema,
  loginInputSchema,
  passwordUpdateSchema,
  recoveryInputSchema,
  signupInputSchema,
  totpCodeSchema,
} from "../lib/validation/auth.ts";

test("normaliza e limita o e-mail", () => {
  assert.equal(emailInputSchema.parse("  Alice@Example.com "), "alice@example.com");
  assert.equal(emailInputSchema.safeParse(`${"a".repeat(315)}@example.com`).success, false);
});

test("aceita senha longa sem exigir regra de composição e remove privilégios enviados pelo cliente", () => {
  const result = signupInputSchema.parse({
    email: "alice@example.com",
    password: "abcdefghijkl",
    username: "Alice_1",
    captchaToken: "captcha",
    role: "admin",
  });
  assert.equal(result.password, "abcdefghijkl");
  assert.equal(result.username, "alice_1");
  assert.equal("role" in result, false);
  assert.equal(signupInputSchema.safeParse({ ...result, password: "short" }).success, false);
  assert.equal(signupInputSchema.safeParse({ ...result, password: "a".repeat(129) }).success, false);
});

test("exige captcha para login e recuperação e limita os tokens", () => {
  assert.equal(loginInputSchema.safeParse({ email: "alice@example.com", password: "old-password" }).success, false);
  assert.equal(recoveryInputSchema.safeParse({ email: "alice@example.com", captchaToken: "captcha" }).success, true);
  assert.equal(recoveryInputSchema.safeParse({ email: "alice@example.com", captchaToken: "x".repeat(4097) }).success, false);
});

test("valida redefinição de senha, TOTP e evento de honeypot", () => {
  assert.equal(passwordUpdateSchema.safeParse({ password: "abcdefghijkl", confirmPassword: "abcdefghijkl" }).success, true);
  assert.equal(passwordUpdateSchema.safeParse({ password: "abcdefghijkl", confirmPassword: "differentpass" }).success, false);
  assert.equal(totpCodeSchema.safeParse("123456").success, true);
  assert.equal(totpCodeSchema.safeParse("12a456").success, false);
  assert.equal(honeypotEventSchema.safeParse({ action: "signup", honeypot: "bot" }).success, true);
  assert.equal(honeypotEventSchema.safeParse({ action: "signup", honeypot: "" }).success, false);
});
