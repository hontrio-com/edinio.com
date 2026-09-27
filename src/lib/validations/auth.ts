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

/*
 * ⚠ FARA `confirm_password` SI FARA `terms` (27.09.2026). Parola are ochiul de
 * afisare, deci a doua tastare nu mai prindea nimic ce nu se vede; iar bifa de
 * termeni nu ajungea nicaieri pe server. Acordul e acum o propozitie langa buton.
 */
export const registerSchema = z.object({
  full_name: z
    .string()
    .min(2, "Numele trebuie să aibă cel puțin 2 caractere")
    .max(80, "Numele este prea lung"),
  email: z
    .string()
    .min(1, "Scrie adresa de email")
    .email("Adresa de email nu este validă"),
  password: z
    .string()
    .min(8, "Parola trebuie să aibă cel puțin 8 caractere")
    .regex(/[A-Z]/, "Parola trebuie să conțină cel puțin o literă mare")
    .regex(/[0-9]/, "Parola trebuie să conțină cel puțin o cifră"),
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
