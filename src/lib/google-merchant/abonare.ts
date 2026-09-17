import { PLATFORM_ORIGIN } from "@/lib/seo";
import {
  createNotificationSubscription, listNotificationSubscriptions, updateNotificationSubscriptionUri,
} from "./client";

/**
 * Abonarea la notificarile de stare ale produselor (PRODUCT_STATUS_CHANGE), o singura data pe cont.
 *
 * ═══ ⚠⚠ CE ERA STRICAT, DE DOUA ORI (masurat 17.09.2026) ═══
 *
 * 1. Cererea de creare n-avea `targetAccount` (vezi `corpAbonare`), iar eroarea se inghitea: 0 din 7
 *    magazine conectate aveau abonare.
 * 2. `GMC_WEBHOOK_SECRET` NU exista in Vercel. Webhook-ul e inchis din constructie cand lipseste, deci
 *    chiar si o abonare reusita ar fi trimis notificari pe care ruta le refuza pe toate.
 *
 * Deci aici se spune MOTIVUL, nu se inghite nimic: fara secret nu se creeaza abonarea (ar fi moarta), cu
 * eroare se intoarce mesajul lui Google, iar panoul le arata pe amandoua.
 */

const CAPAT_WEBHOOK = `${PLATFORM_ORIGIN}/api/google-merchant/webhook`;

export function secretulWebhookului(): string | null {
  const s = process.env.GMC_WEBHOOK_SECRET?.trim();
  return s ? s : null;
}

export function adresaWebhookului(secret: string): string {
  return `${CAPAT_WEBHOOK}?token=${encodeURIComponent(secret)}`;
}

export type RezultatAbonare =
  | { stare: "activa"; name: string }
  | { stare: "fara-secret" }
  | { stare: "eroare"; mesaj: string; reason?: string };

/**
 * Gaseste abonarea NOASTRA pe cont sau o creeaza.
 *
 * ⚠ Documentatia nu permite doua abonari „pentru sine” la acelasi eveniment, deci o reconectare care ar
 * crea orbeste inca una ar cadea. Se refoloseste cea existenta, iar daca adresa ei e veche (alt secret,
 * alta gazda) se actualizeaza cu PATCH.
 *
 * ⚠ Se ia numai o abonare care trimite deja la webhook-ul NOSTRU. O abonare cu alta adresa poate fi a
 * altei aplicatii legate de contul comerciantului, si n-avem voie sa i-o furam.
 */
export async function asiguraAbonarea(token: string, accountId: string): Promise<RezultatAbonare> {
  const secret = secretulWebhookului();
  if (!secret) return { stare: "fara-secret" };
  const adresa = adresaWebhookului(secret);

  const lista = await listNotificationSubscriptions(token, accountId);
  if (!("error" in lista)) {
    const aNoastra = (lista.data.notificationSubscriptions ?? []).find((s) =>
      s.registeredEvent === "PRODUCT_STATUS_CHANGE"
      && String(s.callBackUri ?? "").startsWith(CAPAT_WEBHOOK)
      && (s.targetAccount === `accounts/${accountId}` || s.allManagedAccounts === true));
    if (aNoastra?.name) {
      if (aNoastra.callBackUri !== adresa) {
        const act = await updateNotificationSubscriptionUri(token, aNoastra.name, adresa);
        if ("error" in act) return { stare: "eroare", mesaj: act.error, reason: act.reason };
      }
      return { stare: "activa", name: aNoastra.name };
    }
  }

  const creata = await createNotificationSubscription(token, accountId, adresa);
  if ("error" in creata) return { stare: "eroare", mesaj: creata.error, reason: creata.reason };
  return { stare: "activa", name: creata.data.name };
}
