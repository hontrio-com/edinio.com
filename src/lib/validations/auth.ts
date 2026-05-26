import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Adresa de email este obligatorie")
    .email("Adresa de email nu este valida"),
  password: z
    .string()
    .min(1, "Parola este obligatorie"),
});

export const registerSchema = z
  .object({
    full_name: z
      .string()
      .min(2, "Numele trebuie sa aiba cel putin 2 caractere")
      .max(80, "Numele este prea lung"),
    email: z
      .string()
      .min(1, "Adresa de email este obligatorie")
      .email("Adresa de email nu este valida"),
    password: z
      .string()
      .min(8, "Parola trebuie sa aiba cel putin 8 caractere")
      .regex(/[A-Z]/, "Parola trebuie sa contina cel putin o litera mare")
      .regex(/[0-9]/, "Parola trebuie sa contina cel putin un numar"),
    confirm_password: z.string().min(1, "Confirmarea parolei este obligatorie"),
    terms: z.boolean().refine((v) => v === true, {
      message: "Trebuie sa accepti termenii si conditiile",
    }),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Parolele nu coincid",
    path: ["confirm_password"],
  });

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, "Adresa de email este obligatorie")
    .email("Adresa de email nu este valida"),
});

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Parola trebuie sa aiba cel putin 8 caractere")
      .regex(/[A-Z]/, "Parola trebuie sa contina cel putin o litera mare")
      .regex(/[0-9]/, "Parola trebuie sa contina cel putin un numar"),
    confirm_password: z.string().min(1, "Confirmarea parolei este obligatorie"),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Parolele nu coincid",
    path: ["confirm_password"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
