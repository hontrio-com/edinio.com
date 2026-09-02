import type { EvenimentEdinio } from "../evenimente";
import { catreMeta } from "../adaptor-meta";
import { externalId } from "./amprenta-om";
import type { ContextTrimitere, Refuz } from "./sarcina-tiktok";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  MESAJUL CATRE META CONVERSIONS API, CONSTRUIT PE SERVER
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ CARTOGRAFIEREA E `catreMeta`, ACEEASI CA IN BROWSER. Un al doilea tabel scris
  aici ar fi inceput identic si s-ar fi despartit la prima schimbare — iar atunci
  acelasi eveniment ar fi plecat sub doua nume si deduplicarea n-ar mai fi avut ce
  uni. Un singur loc hotaraste FORMA; aici se hotaraste doar TRANSPORTUL.

  ⚠ SI DE CE `catreMeta` NU CARTOGRAFIAZA `page_view`. Masurat pe 01.09.2026:
  pixelul lor trage singur `PageView` la fiecare schimbare de pagina intr-o
  aplicatie de o pagina. Trimis si de aici, s-ar fi numarat de doua ori. Nu e o
  scapare, e o hotarare — de aceea evenimentul e refuzat, cu motiv scris.
*/

export type SarcinaMeta = {
  data: Array<Record<string, unknown>>;
};

function clipa(cand?: string): number {
  if (!cand) return Date.now();
  const t = Date.parse(cand);
  return Number.isFinite(t) ? t : Date.now();
}

/**
 * Mesajul gata de trimis, sau motivul pentru care nu se trimite.
 *
 * ⚠ SE VALIDEAZA LA NOI, nu la ei. Lectia de la TikTok: raspunsul furnizorului
 * dovedeste ca mesajul A AJUNS, nu ca e bun. Meta e mai vorbareata (intoarce
 * `messages` cu avertismente), dar avertismentele nu opresc nimic si nu le vede
 * nimeni. Ce nu trece de aici nu pleaca.
 */
export function sarcinaMeta(
  ev: EvenimentEdinio,
  ctx: ContextTrimitere,
  pixel: string,
  amprentaOmului: string,
  candSAvenit?: string,
  martori?: { fbp?: string; fbc?: string },
): SarcinaMeta | Refuz {
  if (!pixel) return { motiv: "lipseste id-ul pixelului Meta" };

  const t = catreMeta(ev);
  if (!t) return { motiv: `evenimentul "${ev.name}" nu are cartografiere catre Meta` };
  if (!t.eventID) return { motiv: `evenimentul "${ev.name}" n-are event_id — fara el nu se poate deduplica` };

  const custom: Record<string, unknown> = { ...t.date };
  if (custom.value !== undefined && !custom.currency) {
    return { motiv: `evenimentul "${ev.name}" are valoare fara moneda` };
  }

  /*
    ⚠ META CERE CEL PUTIN UN CAMP DESPRE OM. Fara niciunul, evenimentul e primit
    si aruncat la ei — deci ar arata ca a mers. Amprenta exista intotdeauna, deci
    conditia e implinita; ip-ul si browserul doar o intaresc.
  */
  const user: Record<string, unknown> = { external_id: externalId(amprentaOmului) };
  if (ctx.ip) user.client_ip_address = ctx.ip;
  if (ctx.userAgent) user.client_user_agent = ctx.userAgent;
  /* ⚠ Numele exacte pe care le asteapta ei: `fbp` si `fbc`, nu numele cookie-ului. */
  if (martori?.fbp) user.fbp = martori.fbp;
  if (martori?.fbc) user.fbc = martori.fbc;

  return {
    data: [{
      event_name: t.nume,
      /* Secunde, si clipa PETRECERII — o reincercare n-are voie sa mute conversia. */
      event_time: Math.floor(clipa(candSAvenit) / 1000),
      event_id: t.eventID,
      /* ⚠ Fara `action_source` mesajul e respins; „website" e singurul adevarat aici. */
      action_source: "website",
      ...(ctx.url ? { event_source_url: ctx.url } : {}),
      user_data: user,
      ...(Object.keys(custom).length ? { custom_data: custom } : {}),
    }],
  };
}

export function eRefuzMeta(x: SarcinaMeta | Refuz): x is Refuz {
  return "motiv" in x;
}
