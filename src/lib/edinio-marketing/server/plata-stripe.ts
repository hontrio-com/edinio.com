import { getStripe } from "@/lib/stripe";
import { logError } from "@/lib/error-logger";
import { verdictulPlatii, type PlataVerificata } from "../verdict-plata";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  ADUCEREA SESIUNII DE LA STRIPE, INTR-UN LOC UNDE O POT CHEMA DOI
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE NU STA IN ACTIUNEA DE SERVER. Un modul cu `"use server"` isi face din
  FIECARE export un capat HTTP — deci un ajutor pus acolo ar deveni o ruta
  publica. Lectia e scrisa pe larg in `error-logger.ts`, dupa ce s-a intamplat
  chiar asta.

  ⚠ SI DE CE E NEVOIE DE DOI CHEMATORI. Pagina de plan intreaba „s-a platit?" ca
  sa stie daca poate raporta conversia. `createBusiness` are nevoie de acelasi
  raspuns pentru cu totul altceva: ca sa NU acorde un trial cuiva care tocmai a
  platit. Aceeasi intrebare, doua motive — deci un singur loc unde se raspunde.
*/

/**
 * Aduce sesiunea de la Stripe si o cantareste.
 *
 * ⚠ NIMIC DIN CE VINE DE LA CLIENT NU E CREZUT. Tot ce primeste de acolo e un id;
 * proprietarul, starea platii, suma si moneda se citesc de la Stripe, cu cheia
 * noastra.
 */
export async function aduSiVerificaPlata(idSesiune: string, idOmului: string): Promise<PlataVerificata> {
  const sid = (idSesiune ?? "").trim();
  if (!sid || !sid.startsWith("cs_")) return { ok: false, motiv: "fara-sesiune" };

  try {
    const sesiune = await getStripe().checkout.sessions.retrieve(sid);
    return verdictulPlatii(sesiune, idOmului);
  } catch (e) {
    /*
      ⚠ „NU STIU" NU E „N-A PLATIT". Un id inventat da tot pe aici, dar si o pana
      de retea. Amandoua duc la „nu raporta conversia", ceea ce e purtarea sigura
      — dar in jurnal se scriu deosebit, ca sa nu para o pana ceea ce e o
      incercare.
    */
    const mesaj = e instanceof Error ? e.message : "eroare necunoscuta";
    const eIdNecunoscut = /No such checkout\.session|resource_missing/i.test(mesaj);
    await logError({
      action: eIdNecunoscut ? "plata.sesiuneInexistenta" : "plata.stripeIndisponibil",
      message: mesaj,
      userId: idOmului,
      severity: eIdNecunoscut ? "warning" : "error",
    });
    return { ok: false, motiv: eIdNecunoscut ? "fara-sesiune" : "indisponibil" };
  }
}
