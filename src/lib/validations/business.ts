import { z } from "zod";

export const ROMANIAN_COUNTIES = [
  "Alba", "Arad", "Arges", "Bacau", "Bihor", "Bistrita-Nasaud", "Botosani",
  "Braila", "Brasov", "Bucuresti", "Buzau", "Calarasi", "Caras-Severin",
  "Cluj", "Constanta", "Covasna", "Dambovita", "Dolj", "Galati", "Giurgiu",
  "Gorj", "Harghita", "Hunedoara", "Ialomita", "Iasi", "Ilfov", "Maramures",
  "Mehedinti", "Mures", "Neamt", "Olt", "Prahova", "Salaj", "Satu Mare",
  "Sibiu", "Suceava", "Teleorman", "Timis", "Tulcea", "Valcea", "Vaslui",
  "Vrancea",
];

export const businessSchema = z.object({
  business_name: z.string().min(2, "Minim 2 caractere").max(100),
  tagline: z.string().max(120).optional(),
  phone: z
    .string()
    .regex(/^07[0-9]{8}$/, "Format invalid: 07XXXXXXXX")
    .min(10),
  whatsapp: z
    .string()
    .regex(/^07[0-9]{8}$/, "Format invalid: 07XXXXXXXX")
    .optional()
    .or(z.literal("")),
  email: z.string().email("Email invalid").optional().or(z.literal("")),
  address: z.string().min(5, "Minim 5 caractere"),
  city: z.string().min(2, "Minim 2 caractere"),
  county: z.string().min(1, "Selecteaza judetul"),
  slug: z
    .string()
    .min(3, "Minim 3 caractere")
    .max(50, "Maxim 50 caractere")
    .regex(/^[a-z0-9-]+$/, "Doar litere mici, cifre si liniute"),
});

export type BusinessInput = z.infer<typeof businessSchema>;
