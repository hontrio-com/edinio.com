import type { Metadata } from "next";

/* Fila spunea „Autentificare" si pe pagina de inscriere: titlul venea din layoutul comun al grupului `(auth)`. */
export const metadata: Metadata = { title: { absolute: "Creează cont | Edinio" } };

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
