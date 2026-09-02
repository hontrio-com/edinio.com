import { externalId } from "./amprenta-om";
import type { EvenimentEdinio } from "../evenimente";
import { catreTikTok } from "../adaptor-tiktok";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  MESAJUL CATRE TIKTOK, CONSTRUIT PE SERVER
  ═══════════════════════════════════════════════════════════════════════════════

  ═══ ⚠ CARTOGRAFIEREA E ACEEASI CA IN BROWSER, DINADINS ═══

  Numele evenimentului si continutul lui vin din `catreTikTok`, exact functia pe
  care o foloseste si pixelul din pagina. Un al doilea tabel de cartografiere,
  scris aici, ar fi inceput identic si s-ar fi despartit la prima schimbare — iar
  atunci acelasi eveniment ar fi plecat sub doua nume, si deduplicarea lor n-ar
  mai fi avut ce uni.

  Un singur loc hotaraste FORMA. Aici se hotaraste doar TRANSPORTUL.

  ═══ ⚠ SI DE CE VALIDAM NOI, DESI EI RASPUND `OK` ═══

  Masurat pe 02.09.2026, impotriva serverului lor adevarat: am trimis dinadins o
  valoare fara moneda si am primit `{"code": 0, "message": "OK"}`.

  Deci raspunsul lor dovedeste ca mesajul A AJUNS, nu ca e bun. Greselile de
  continut se vad abia in Events Manager, zile mai tarziu, sau deloc. Dimineata,
  pixelul din browser cel putin striga in consola despre un `content_type`
  invalid; de pe server nu striga nimeni.

  De aceea ce nu trece verificarea de aici NU pleaca.
*/

/** Datele de context ale cererii care a produs conversia. */
export type ContextTrimitere = {
  ip?: string | null;
  userAgent?: string | null;
  url?: string | null;
  referrer?: string | null;
};

/*
  ⚠ AMPRENTA VINE DIN `amprenta-om.ts`, nu de aici. Se reexporta ca sa nu se rupa
  cine o importa de la locul vechi — dar locul ei e cel comun: Meta o foloseste
  pe ACEEASI, si doi oameni deosebiti n-au voie sa iasa acelasi om.
*/
export { externalId };

/**
 * Clipa evenimentului, in milisecunde.
 *
 * ⚠ UN SIR STRICAT DA `NaN`, iar `NaN` trimis ca `event_time` ar fi respins tacut
 * de ei. Se cade inapoi pe „acum" — o conversie cu ceasul aproximativ e mai buna
 * decat una aruncata.
 */
function clipa(cand?: string): number {
  if (!cand) return Date.now();
  const t = Date.parse(cand);
  return Number.isFinite(t) ? t : Date.now();
}

export type SarcinaTikTok = {
  event_source: "web";
  event_source_id: string;
  data: Array<Record<string, unknown>>;
};

export type Refuz = { motiv: string };

/**
 * Mesajul gata de trimis, sau motivul pentru care nu se trimite.
 *
 * ⚠ INTOARCE UN REFUZ CU MOTIV, nu `null`. Un `null` tacut ar fi facut coada sa
 * para golita cand de fapt evenimentele erau aruncate — exact felul de zero care
 * m-a pacalit de trei ori azi.
 */
export function sarcinaTikTok(
  ev: EvenimentEdinio,
  ctx: ContextTrimitere,
  pixel: string,
  amprentaOmului: string,
  /** Cand s-a petrecut. Lipsa doar la randurile puse la coada inainte de 02.09.2026. */
  candSAvenit?: string,
): SarcinaTikTok | Refuz {
  if (!pixel) return { motiv: "lipseste id-ul pixelului TikTok" };

  const t = catreTikTok(ev);
  if (!t) return { motiv: `evenimentul "${ev.name}" nu are cartografiere catre TikTok` };
  if (!t.eventId) return { motiv: `evenimentul "${ev.name}" n-are event_id — fara el nu se poate deduplica` };

  const proprietati = { ...t.date };

  /*
    ⚠ VALOAREA FARA MONEDA E O CIFRA FARA INTELES. TikTok o primeste linistit
    (probat: raspunde OK), si abia in rapoartele lor devine venit fara unitate.
    Aici cade.
  */
  if (proprietati.value !== undefined && !proprietati.currency) {
    return { motiv: `evenimentul "${ev.name}" are valoare fara moneda` };
  }

  const user: Record<string, unknown> = { external_id: externalId(amprentaOmului) };
  /* Numai ce chiar avem. Un camp gol trimis e o afirmatie despre ce nu stim. */
  if (ctx.ip) user.ip = ctx.ip;
  if (ctx.userAgent) user.user_agent = ctx.userAgent;

  const pagina: Record<string, unknown> = {};
  if (ctx.url) pagina.url = ctx.url;
  if (ctx.referrer) pagina.referrer = ctx.referrer;

  return {
    event_source: "web",
    event_source_id: pixel,
    data: [{
      event: t.nume,
      /*
        ⚠ CLIPA PETRECERII, NU A TRIMITERII. O reincercare peste sapte ore n-are
        voie sa mute conversia cu sapte ore — furnizorii atribuie dupa campul asta.

        Secunde, nu milisecunde: trimise in milisecunde, evenimentele cad in viitor.
      */
      event_time: Math.floor(clipa(candSAvenit) / 1000),
      event_id: t.eventId,
      user,
      ...(Object.keys(pagina).length ? { page: pagina } : {}),
      ...(Object.keys(proprietati).length ? { properties: proprietati } : {}),
    }],
  };
}

export function eRefuz(x: SarcinaTikTok | Refuz): x is Refuz {
  return "motiv" in x;
}
