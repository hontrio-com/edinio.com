import "server-only";
import { cookies } from "next/headers";
import { adreseleDeIntoarcere, hontrioConfigurat } from "./config";
import { COOKIE_CERERE, cerereaDinCookie, type CerereAutorizare } from "./cerere";

/** Unde asteapta cererea Hontrio sa fie aprobata. */
export const CALE_AUTORIZARE = "/dashboard/features/hontrio/autorizare";

/**
 * Cererea Hontrio din cookie-ul browserului, daca e inca valida.
 *
 * Sta aici, nu in pagina: ceasul (`Date.now`) nu se citeste in corpul unei componente, iar pagina de
 * aprobare si `/dashboard` trebuie sa judece cererea cu aceeasi regula.
 */
export async function cerereaCurenta(): Promise<CerereAutorizare | null> {
  const valoare = (await cookies()).get(COOKIE_CERERE)?.value;
  if (!valoare) return null;
  return cerereaDinCookie(valoare, adreseleDeIntoarcere(), hontrioConfigurat(), Date.now());
}

/**
 * Exista o cerere Hontrio valida, care inca asteapta raspunsul omului?
 *
 * ⚠ O CHEAMA `/dashboard`, ca sa duca omul la ecranul de aprobare dupa logare: logarea se termina
 * mereu acolo, fara adresa de intoarcere (vezi `cerere.ts`). Numai o cerere VALIDA trimite mai
 * departe; un cookie expirat sau stricat lasa panoul in pace, altfel omul ar fi fost aruncat pe un
 * ecran „cererea a expirat" la fiecare deschidere a panoului, pana expira si cookie-ul.
 */
export async function cerereInAsteptare(): Promise<boolean> {
  return (await cerereaCurenta()) !== null;
}
