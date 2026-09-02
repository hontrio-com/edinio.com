import { createHash } from "node:crypto";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  AMPRENTA OMULUI, PENTRU ORICE FURNIZOR DE RECLAME
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ E UN MODUL AL LUI, NU AL TIKTOK-ULUI. Statea in `sarcina-tiktok.ts` cat timp
  exista un singur furnizor. Lasata acolo, Meta ar fi trebuit sa importe din
  fisierul altcuiva — sau, mai probabil, si-ar fi facut a doua functie, iar
  acelasi om ar fi capatat doua amprente deosebite.

  ⚠ NU SE TRIMITE NICIODATA UN EMAIL. Nici in clar, nici cu hash. Un email cu
  hash ar creste mult potrivirea la ei — asa lucreaza mai toata lumea — dar e o
  hotarare cu urmari legale (GDPR, si ce scrie in politica noastra de
  confidentialitate), nu una tehnica. Nu e a mea, deci nu o iau.

  ⚠ SI DE CE E ALTCEVA DECAT `event_id`. `event_id` raspunde la „care eveniment"
  si serveste deduplicarii intre browser si server. Amprenta raspunde la „care
  om" si serveste potrivirii audientei. Folosite una in locul alteia, cele doua
  ar depinde una de alta fara niciun motiv.
*/

/** SHA-256 intreg, 64 de caractere — ce asteapta si Meta, si TikTok. */
export function externalId(saminta: string): string {
  return createHash("sha256").update(`edinio.user.v1:${saminta}`).digest("hex");
}
