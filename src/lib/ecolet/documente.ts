import { createHmac } from "node:crypto";

/**
 * Unde se pastreaza eticheta eColet.
 *
 * ⚠ Copia din CDN e doar VITEZA, nu o plasa de siguranta: la eColet
 * `GET /order/{id}/download-waybill` e o citire pura, care se poate cere de cate
 * ori e nevoie. (La GLS era altfel — acolo a doua chemare a metodei de emitere ar
 * fi creat un al doilea colet real, si de aceea copia era obligatorie.)
 *
 * ═══ ⚠ NU E O POZA DE PRODUS ═══
 *
 * Fisierele din R2 se servesc public prin CDN, cu `max-age` de un an. O eticheta
 * AWB contine NUMELE, ADRESA si TELEFONUL cumparatorului — date personale ale
 * unui tert, nu ale comerciantului.
 *
 * De aceea cheia nu se poate ghici: are o semnatura HMAC din secretul serverului.
 * Cine stie cele doua UUID-uri — iar comerciantul le stie pe ale lui, si un fost
 * angajat la fel — tot nu poate compune adresa. Iar ruta de descarcare cere
 * sesiune si verifica proprietatea magazinului. Cele doua paze sunt independente
 * dinadins.
 */

/**
 * Secretul de semnare. Acelasi tipar ca la GLS si Pall-Ex: o variabila dedicata
 * daca exista, altfel cheia de service role, care oricum nu paraseste serverul.
 */
function secret(): string {
  return process.env.SHIPPING_QUOTE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

/**
 * Cheia R2 a etichetei.
 *
 * ⚠ Si prefixul, si sirul semnat contin numele curierului. Copiate de la alt
 * curier, doua etichete ale unor curieri diferiti pe ACEEASI comanda ar ajunge la
 * aceeasi cheie si s-ar suprascrie — iar stergerea la anularea uneia ar sterge-o
 * pe a celeilalte.
 *
 * ⚠ Extensia intra si ea in cheie: eColet poate intoarce ZPL in loc de PDF
 * (`waybill_extension`), iar cele doua nu au voie sa ajunga in acelasi fisier.
 * Un ZPL servit ca PDF se deschide gol, si comerciantul afla de la imprimanta.
 */
export function cheieEticheta(businessId: string, orderId: string, extensie = "pdf"): string {
  const ext = /^[a-z0-9]{1,5}$/i.test(extensie) ? extensie.toLowerCase() : "pdf";
  const semnatura = createHmac("sha256", secret())
    .update(`ecolet:eticheta:${ext}:${businessId}:${orderId}`)
    .digest("hex")
    .slice(0, 24);
  return `awb/ecolet/${businessId}/${orderId}-${semnatura}.${ext}`;
}

/**
 * Extensia si tipul de continut, din ce spune eColet.
 *
 * ⚠ `waybill_extension` e `pdf` sau `zpl`. ZPL e text pentru imprimante de
 * etichete: servit cu `application/pdf`, browserul incearca sa-l deschida ca PDF
 * si arata o pagina goala — un defect care pare al nostru si nu e.
 */
export function felulEtichetei(extensie: string | null | undefined): { ext: string; tip: string } {
  const e = (extensie ?? "").trim().toLowerCase();
  if (e === "zpl") return { ext: "zpl", tip: "application/vnd.zebra.zpl" };
  return { ext: "pdf", tip: "application/pdf" };
}

/** Numele sub care se descarca fisierul. */
export function numeFisier(awb: string, extensie = "pdf"): string {
  const { ext } = felulEtichetei(extensie);
  /* Un AWB poate purta orice: se curata, ca sa nu iasa un nume pe care sistemul
     de operare il refuza. */
  const curat = (awb ?? "").replace(/[^A-Za-z0-9._-]/g, "") || "expediere";
  return `awb-ecolet-${curat}.${ext}`;
}
