import { numeTM, telefonTM } from "./persoana";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  DATELE OMULUI PENTRU `__sm__order`, FARA SA TREACA PRIN HTML
  ═══════════════════════════════════════════════════════════════════════════════

  theMarketer cere evenimentul de comanda pe pagina de multumire, cu emailul, telefonul, numele si
  adresa omului. Pagina de multumire NU le pune in clar in HTML (am scos asta dinadins la Meta si TikTok,
  care le primesc hash-uite). Deci:
    1. la trimiterea comenzii, checkout-ul pastreaza in `sessionStorage` (tabul curent) exact ce a scris
       omul in formular, NUMAI daca scriptul theMarketer e deja incarcat (adica acordul pentru marketing e
       dat si modulul e pornit);
    2. pagina de multumire le ia de acolo, o singura data, le sterge si trimite evenimentul.

  `sessionStorage` traieste in tab si trece de ocolul prin procesatorul de plata (aceeasi fila). Lipsa lor
  (alt dispozitiv, alta fila) inseamna doar ca evenimentul din browser nu pleaca: comanda ajunge oricum la
  theMarketer prin `save_order`, de pe server.
*/

const PREFIX = "edinio_tm_comanda_";
/** Peste atat, datele pastrate nu mai sunt ale comenzii de acum (o plata lasata deschisa o zi). */
const VALABIL_MS = 3 * 3600 * 1000;

export type PersoanaTM = {
  email_address: string;
  phone: string;
  firstname: string;
  lastname: string;
  city: string;
  county: string;
  address: string;
};

function scriptulEIncarcat(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as unknown as { __edinioMktr?: unknown }).__edinioMktr;
}

/** Pastreaza datele scrise de om, pentru pagina de multumire. Nu arunca. */
export function pastreazaPentruTheMarketer(orderId: string, d: {
  email?: string | null; telefon?: string | null; nume?: string | null;
  oras?: string | null; judet?: string | null; adresa?: string | null;
}): void {
  try {
    if (!orderId || !scriptulEIncarcat()) return;
    const email = (d.email ?? "").trim().toLowerCase();
    const telefon = (d.telefon ?? "").trim();
    if (!email && !telefon) return;
    const { firstname, lastname } = numeTM(d.nume);
    const p: PersoanaTM = {
      email_address: email,
      phone: telefon ? telefonTM(telefon) : "",
      firstname,
      lastname,
      city: (d.oras ?? "").trim(),
      county: (d.judet ?? "").trim(),
      address: (d.adresa ?? "").trim(),
    };
    sessionStorage.setItem(PREFIX + orderId, JSON.stringify({ t: Date.now(), p }));
  } catch {
    /* Stocare blocata: evenimentul din browser nu pleaca, comanda ajunge oricum prin server. */
  }
}

/** Ia datele pastrate pentru comanda asta, o singura data (le sterge). `null` cand nu sunt. */
export function iaPentruTheMarketer(orderId: string, acum: number = Date.now()): PersoanaTM | null {
  try {
    const cheie = PREFIX + orderId;
    const brut = sessionStorage.getItem(cheie);
    if (!brut) return null;
    sessionStorage.removeItem(cheie);
    const o = JSON.parse(brut) as { t?: unknown; p?: PersoanaTM };
    if (typeof o.t !== "number" || acum - o.t > VALABIL_MS || !o.p) return null;
    return o.p;
  } catch {
    return null;
  }
}
