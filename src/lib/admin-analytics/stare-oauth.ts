import { signState, verifyState } from "@/lib/google-analytics/oauth";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  STAREA OAUTH PENTRU ADMIN
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ SE FOLOSESTE ACEEASI SEMNATURA ca la magazine (`signState`/`verifyState`),
  numai ca „subiectul" nu e un id de magazin, ci un cuvant al platformei. Asa
  aterizarea ramane UNA singura, si nu trebuie inregistrat un al doilea
  `redirect_uri` in Google Cloud.

  ⚠ CUVANTUL ARE DOUA PUNCTE, si nu intamplator. `verifyState` desface sirul dupa
  PUNCT, in trei bucati (`subiect.timp.semnatura`), iar id-urile de magazin sunt
  uuid-uri. Un subiect cu `:` nu se poate ciocni nici de un uuid, nici de
  desfacerea in sine.

  ⚠ SI NU E O PAZA. Starea e semnata cu HMAC si tine 15 minute, dar rostul ei e
  sa lege intoarcerea de plecare — nu sa dovedeasca cine e omul. Cine e omul se
  verifica din nou la aterizare, cu garda de administrator.

  ⚠ DE CE STA SINGUR, SI NU IN `conexiune.ts`. Acolo se importa clientul cu cheie
  de serviciu, care cere variabile de mediu la incarcare. Aici e logica pura pe
  care o probam prin chemare — a doua oara azi cand despart la fel, dupa ce
  `desfaJeton` a trecut cu o unealta si a cazut in suita adevarata.
*/
export const SUBIECT_ADMIN = "platforma:admin";

/** Starea cu care plecam spre Google din admin. */
export function semneazaStareAdmin(): string {
  return signState(SUBIECT_ADMIN);
}

/** Intoarcerea asta e a platformei, nu a unui magazin? */
export function eStareDeAdmin(state: string | null): boolean {
  return !!state && verifyState(state) === SUBIECT_ADMIN;
}
