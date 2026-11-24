/**
 * Ce stie operatorul despre pagina de pe care scrie clientul: produsul privit, cosul si comanda abia plasata.
 *
 * ⚠ FARA DATE PERSONALE. De aici pleaca numai lucruri pe care magazinul le arata oricui: numele si pretul
 * produsului, valoarea cosului, numarul comenzii. Cine e clientul se afla altundeva, pe server, din sesiunea
 * de cont (`/api/cont/suport`).
 *
 * ⚠ SE CITESTE DIN PAGINA, LA DESCHIDEREA CHATULUI. Nu exista evenimente trimise din zeci de componente:
 * produsul vine din datele structurate ale paginii (JSON-LD `Product`, puse oricum pentru Google), cosul din
 * stocarea lui (`cart_<slug>`), comanda din ce a notat pagina de multumire. Cine nu deschide chatul nu
 * plateste nimic.
 *
 * Numai in browser. Fara `server-only` si fara importuri de server.
 */

export type ContextPagina = {
  titlu: string;
  adresa: string;
  produs?: { nume: string; cod?: string; pret?: string };
  cos?: { produse: number; valoare: string };
};

/** `plata` e felul platii, in cuvinte („Ramburs la livrare”), nu starea ei. */
export type ContextComanda = { numar: string; total: string; plata?: string };

/** Valorile pleaca in atribute de cel mult 255 de caractere (limita tawk.to); taiem mult sub ea. */
const LUNGIME = 120;

function scurt(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, LUNGIME) : "";
}

function pret(suma: unknown, moneda: unknown): string {
  const n = typeof suma === "number" ? suma : Number.parseFloat(String(suma ?? ""));
  if (!Number.isFinite(n) || n < 0) return "";
  const m = typeof moneda === "string" && /^[A-Z]{3}$/.test(moneda) ? moneda : "RON";
  return `${n.toFixed(2).replace(/\.00$/, "")} ${m}`;
}

/** Produsul din datele structurate ale paginii, sau `undefined` cand pagina nu e una de produs. */
export function produsulDinPagina(doc: Document = document): ContextPagina["produs"] {
  for (const el of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    let date: unknown;
    try {
      date = JSON.parse(el.textContent ?? "");
    } catch {
      continue;
    }
    const candidati = Array.isArray(date) ? date : [date, ...(((date as { "@graph"?: unknown[] } | null)?.["@graph"]) ?? [])];
    for (const c of candidati) {
      if (!c || typeof c !== "object") continue;
      const o = c as Record<string, unknown>;
      const tip = o["@type"];
      const eProdus = tip === "Product" || (Array.isArray(tip) && tip.includes("Product"));
      if (!eProdus) continue;
      const nume = scurt(o.name);
      if (!nume) continue;
      const oferte = Array.isArray(o.offers) ? o.offers[0] : o.offers;
      const of = (oferte && typeof oferte === "object" ? oferte : {}) as Record<string, unknown>;
      const p = pret(of.price ?? of.lowPrice, of.priceCurrency);
      const cod = scurt(o.sku);
      return { nume, ...(cod ? { cod } : {}), ...(p ? { pret: p } : {}) };
    }
  }
  return undefined;
}

/** Cosul magazinului, din stocarea lui. Gol sau stricat = fara cos. */
export function cosulDinStocare(slug: string, stocare: Pick<Storage, "getItem"> | null = safeStorage()): ContextPagina["cos"] {
  if (!stocare) return undefined;
  try {
    const brut = stocare.getItem(`cart_${slug}`);
    if (!brut) return undefined;
    const linii = JSON.parse(brut) as unknown;
    if (!Array.isArray(linii) || linii.length === 0) return undefined;
    let produse = 0;
    let valoare = 0;
    for (const l of linii) {
      if (!l || typeof l !== "object") continue;
      const linie = l as { quantity?: unknown; price?: unknown };
      const q = typeof linie.quantity === "number" && linie.quantity > 0 ? linie.quantity : 0;
      const p = typeof linie.price === "number" && linie.price >= 0 ? linie.price : 0;
      produse += q;
      valoare += q * p;
    }
    if (produse === 0) return undefined;
    return { produse, valoare: pret(valoare, "RON") };
  } catch {
    return undefined;
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Tot ce se stie despre pagina, in clipa asta. */
export function contextulPaginii(slug: string): ContextPagina {
  const produs = produsulDinPagina();
  const cos = cosulDinStocare(slug);
  return {
    titlu: scurt(document.title),
    /* Fara parametri: pot purta id-ul unei comenzi sau un cuvant cautat. */
    adresa: `${window.location.origin}${window.location.pathname}`.slice(0, 255),
    ...(produs ? { produs } : {}),
    ...(cos ? { cos } : {}),
  };
}

/* ═══ Comanda abia plasata ═══
 *
 * O noteaza pagina de multumire (`ComandaPentruChat`), in memoria paginii si in `sessionStorage`, ca sa
 * ramana cat omul mai umbla prin magazin in aceeasi fila. Numarul comenzii e oricum scris pe pagina.
 */
const CHEIE_COMANDA = "edinio_chat_comanda";

export function noteazaComanda(slug: string, c: ContextComanda): void {
  const numar = scurt(c.numar);
  if (!numar) return;
  try {
    const plata = scurt(c.plata);
    window.sessionStorage.setItem(`${CHEIE_COMANDA}_${slug}`, JSON.stringify({ numar, total: scurt(c.total), ...(plata ? { plata } : {}) }));
  } catch {
    /* stocare blocata: comanda ramane nestiuta de chat, nimic altceva */
  }
  window.dispatchEvent(new CustomEvent("edinio-chat-comanda", { detail: { slug } }));
}

export function comandaNotata(slug: string): ContextComanda | null {
  try {
    const brut = window.sessionStorage.getItem(`${CHEIE_COMANDA}_${slug}`);
    if (!brut) return null;
    const c = JSON.parse(brut) as Partial<ContextComanda>;
    const numar = scurt(c.numar);
    const plata = scurt(c.plata);
    return numar ? { numar, total: scurt(c.total), ...(plata ? { plata } : {}) } : null;
  } catch {
    return null;
  }
}
