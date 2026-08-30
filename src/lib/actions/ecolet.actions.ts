"use server";

import { enqueueAboutYouShip } from "@/lib/aboutyou/queue";
import { dupaRaspuns } from "@/lib/marketplace/dupa-raspuns";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { secretDinConfig } from "@/lib/integrari/secret-server";
import { logError } from "@/lib/error-logger";
import { cheieOperatie, cuRegistru, marcheazaAnulata } from "@/lib/operatii/registru";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import {
  anuleaza,
  catalogServicii,
  citesteExpedierea,
  coteaza,
  ecoletGata,
  probaConexiune,
  stareaTrimiterii,
  trimite,
  type EcoletConfig,
} from "@/lib/ecolet/client";
import {
  codPostalDeTrimis,
  corpExpediere,
  lipsuriAdresa,
  type AdresaComanda,
} from "@/lib/ecolet/expediere";
import { ofertePosibile, etichetaOferta, numeServiciuEcolet, type OfertaEcolet } from "@/lib/ecolet/preturi";
import { rezolvaLocalitatea } from "@/lib/ecolet/cautare";
import type { Json } from "@/types/database.types";

/**
 * Actiunile eColet.
 *
 * ⚠ eColet nu are mediu de test: fiecare emitere e un transport real, facturat.
 * De aceea totul trece prin registrul de operatii externe.
 *
 * ⚠ SI EMITEREA E ASINCRONA — asta schimba tot fata de ceilalti sapte curieri.
 * `send-order` intoarce doar `order_to_send_id`; AWB-ul apare abia dupa ce
 * `GET /order-to-send/{id}` trece pe `ordered`. Vezi `finalizeazaEmiterea`.
 *
 * ⚠ TOATE exporturile unui fisier „use server" sunt endpointuri POST publice, si
 * fiecare isi verifica singur proprietatea magazinului.
 */

// ─── Proprietate ──────────────────────────────────────────────────────────────

type Proprietar =
  | { ok: false; error: string }
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> };

async function proprietar(businessId: string): Promise<Proprietar> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { ok: false, error: "Acces interzis" };

  return { ok: true, supabase };
}

// ─── Configurare ──────────────────────────────────────────────────────────────

export async function saveEcoletConfig(
  businessId: string,
  config: EcoletConfig,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };

  /*
   * Campurile secrete venite GOALE isi pastreaza valoarea salvata: formularul le
   * primeste mascate, deci o salvare obisnuita nu trebuie sa le stearga.
   *
   * ⚠ Configul vechi se citeste cu SERVICE ROLE: pe clientul comerciantului
   * vederea intoarce `enc.v1.…`, iar `pastreazaSecretele` l-ar „pastra" ca atare —
   * adica ar trimite textul cifrat pe post de token la urmatorul apel.
   */
  const { data: vechi } = await createAdminClient()
    .from("store_settings").select("ecolet_config").eq("business_id", businessId).maybeSingle();
  const configFinal = pastreazaSecretele("ecolet_config", config, vechi?.ecolet_config) as EcoletConfig;

  /*
   * ⚠ LOCALITATEA DE RIDICARE SE REZOLVA AICI, LA SALVARE.
   *
   * eColet cere `locality_id`, un intreg din nomenclatorul lor. Cautat la fiecare
   * expediere si la fiecare cotatie, ar insemna un apel in plus pentru fiecare
   * cumparator care isi scrie orasul — adica plafoanele de cotatie ale
   * magazinului consumate de doua ori mai repede, iar cand se epuizeaza TOTI
   * curierii magazinului trec pe tarif fix.
   *
   * Rezolvat o data, la salvare, ramane in configurare.
   *
   * ⚠ Daca nu se poate rezolva, salvarea MERGE INAINTE, fara id. Comerciantul isi
   * poate salva restul datelor si corecta orasul dupa; iar `hasApi` din checkout
   * cere id-ul, deci lipsa lui inseamna doar tarif fix, nu o integrare stricata.
   * O salvare refuzata pentru un oras scris altfel ar fi fost mai rea.
   */
  const configVechi = vechi?.ecolet_config as EcoletConfig | null;
  const orasNou = (configFinal.expeditor?.locality ?? "").trim();
  const orasVechi = (configVechi?.expeditor?.locality ?? "").trim();
  /* ⚠ Si JUDETUL: `alegeLocalitatea` il foloseste ca sa departa omonimele, deci
     o corectare doar a judetului trebuie sa recalculeze id-ul. Prima forma se uita
     numai la oras si pastra id-ul rezolvat pentru judetul GRESIT. */
  const judetNou = (configFinal.expeditor?.county ?? "").trim();
  const judetVechi = (configVechi?.expeditor?.county ?? "").trim();
  const idVechi = Number(configVechi?.expeditor?.locality_id) || 0;
  const seSchimbaLocul = orasNou !== orasVechi || judetNou !== judetVechi;

  if (orasNou && (seSchimbaLocul || !idVechi)) {
    try {
      const gasita = await rezolvaLocalitatea(
        configFinal, orasNou, configFinal.expeditor?.county,
      );
      configFinal.expeditor = { ...(configFinal.expeditor ?? {}), locality_id: gasita?.id ?? 0 };
    } catch (e) {
      /*
       * ⚠ Cand LOCUL s-a schimbat, id-ul vechi e al altui oras: pastrat, ar trimite
       * marfa de unde nu trebuie, iar salvarea ar raporta succes. Zero opreste
       * vizibil cotarea si aprinde bannerul din formular.
       */
      configFinal.expeditor = { ...(configFinal.expeditor ?? {}), locality_id: 0 };
      await logError({
        action: "ecolet.saveConfig",
        message: `Adresa de ridicare eColet s-a schimbat, dar cautarea localitatii a picat: ${(e as Error).message}. Cotarea ramane oprita pana la o noua salvare.`,
        details: { businessId, oras: orasNou, judet: judetNou },
        businessId, severity: "critical",
      });
    }
  } else if (!seSchimbaLocul && idVechi) {
    configFinal.expeditor = { ...(configFinal.expeditor ?? {}), locality_id: idVechi };
  }

  const { error } = await ctx.supabase.from("store_settings").update({
    ecolet_config: configFinal as unknown as Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };

  /*
   * Se spune pe fata cand localitatea n-a fost recunoscuta: altfel comerciantul ar
   * salva multumit si ar descoperi abia in checkout ca eColet nu apare deloc.
   */
  if (orasNou && !Number(configFinal.expeditor?.locality_id)) {
    return {
      error: `Datele s-au salvat, dar eColet nu recunoaste localitatea „${orasNou}". `
        + "Verifica scrierea — fara ea, cotarea din checkout nu porneste.",
    };
  }
  return { success: true };
}

export async function disconnectEcolet(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };

  const { error } = await ctx.supabase.from("store_settings").update({
    ecolet_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export type ServiciuAratat = {
  slug: string;
  nume: string;
  curier: string;
  activ: boolean;
  ramburs: boolean;
};

/**
 * Proba de conexiune, care aduce si catalogul de servicii.
 *
 * ⚠ Merge pe `GET /services`, NU pe `/me`. `/me` raspunde 200 cu
 * `{"unauthenticated": true}` si cu token gresit, deci un test scris pe statusul
 * HTTP ar iesi VERDE fara nicio credentiala — iar comerciantul ar afla ca nu e
 * conectat abia la prima expediere. `/services` raspunde 401 cinstit si aduce
 * exact lista de care are nevoie configurarea.
 *
 * ⚠ Citire pura: butonul se poate apasa de zece ori fara sa creeze nimic.
 */
export async function testEcoletConnectionAction(
  businessId: string,
  config: EcoletConfig,
): Promise<{ ok: true; servicii: ServiciuAratat[] } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };

  /* Tokenul poate veni mascat din formular: se ia cel salvat. */
  const token = await secretDinConfig(businessId, "ecolet_config", "api_token", config.api_token);
  if (!token) return { error: "Completeaza tokenul din panel.ecolet.ro." };

  const r = await probaConexiune({ ...config, api_token: token });
  if (!r.ok) return { error: r.eroare };

  return {
    ok: true,
    servicii: r.servicii.map((s) => ({
      slug: s.slug,
      nume: s.full_name || s.name || s.slug,
      curier: s.courier?.name ?? "",
      activ: s.status !== false,
      ramburs: s.conditions?.has_cod === true,
    })),
  };
}

// ─── Context ──────────────────────────────────────────────────────────────────

/** Coloanele eColet de pe comanda. */
type ComandaEcolet = {
  ecolet_order_to_send_id?: number | null;
  ecolet_order_id?: number | null;
  ecolet_awb_number?: string | null;
  ecolet_send_state?: string | null;
  ecolet_service_slug?: string | null;
  tracking_number?: string | null;
};

async function configSiComanda(businessId: string, orderId: string) {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  /*
   * ⚠ Configul se citeste cu SERVICE ROLE: vederea `store_settings` nu decripteaza
   * pentru `authenticated`, deci pe clientul utilizatorului tokenul ar veni
   * `enc.v1.…` si eColet ar raspunde „token respins" — fara nimic in mesaj despre
   * cauza reala. Proprietatea magazinului s-a verificat mai sus.
   */
  const admin = createAdminClient();
  const [{ data: settings }, { data: order }] = await Promise.all([
    admin.from("store_settings").select("ecolet_config").eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = settings?.ecolet_config as EcoletConfig | null;
  if (!ecoletGata(config)) return { error: "eColet nu este configurat complet" as const };

  return { supabase, config, order };
}

/**
 * Expeditorul, din configurare.
 *
 * ⚠ NU VINE DIN BROWSER. Altfel oricine cu o sesiune de comerciant ar putea emite
 * pe contul eColet al magazinului cu orice adresa de ridicare.
 *
 * ⚠ Si nu se ia din `businesses` ca la ceilalti curieri: eColet cere
 * `locality_id`, un intreg din nomenclatorul lor, care se rezolva o singura data
 * cand comerciantul isi salveaza configurarea. Pastrat acolo, nu se mai cauta la
 * fiecare expediere.
 */
function expeditorulDin(config: EcoletConfig): AdresaComanda {
  const e = config.expeditor ?? {};
  return {
    nume: e.name ?? "",
    strada: e.street_name ?? "",
    numar: e.street_number ?? "",
    oras: e.locality ?? "",
    judet: e.county ?? "",
    localityId: Number(e.locality_id) || 0,
    codPostal: e.postal_code ?? "",
    telefon: e.phone ?? "",
    email: e.email ?? "",
    persoanaContact: e.contact_person ?? null,
  };
}

// ─── Cotare din panou ─────────────────────────────────────────────────────────

export type OfertaAratata = OfertaEcolet & { eticheta: string };

/**
 * Preturile pentru o comanda, cerute din formularul de AWB.
 *
 * ⚠ Citire pura (`reload-form` nu creeaza nimic), deci NU trece prin registru si
 * se poate apasa de cate ori vrea comerciantul.
 */
export async function coteazaEcoletAction(
  businessId: string,
  orderId: string,
  date: { oras: string; judet: string; greutateKg: number; ramburs?: number },
): Promise<{ oferte: OfertaAratata[] } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { config, order } = ctx;

  const expeditor = expeditorulDin(config);
  const lipsuriExpeditor = lipsuriAdresa(expeditor, "expeditor");
  if (lipsuriExpeditor.length > 0) {
    return {
      error: `Completeaza adresa de ridicare in configurarea eColet: ${lipsuriExpeditor.join(", ")}.`,
    };
  }

  /* ⚠ In `try`, ca si geamana din emitere: o actiune care ARUNCA nu ajunge la
     `if ("error" in r)` din formular, deci butonul ramane blocat pe „Se
     calculeaza..." si omul nu afla nimic. */
  let localitate: Awaited<ReturnType<typeof rezolvaLocalitatea>> = null;
  try {
    localitate = await rezolvaLocalitatea(config, date.oras, date.judet);
  } catch (e) {
    return { error: `eColet nu a raspuns la cautarea localitatii: ${(e as Error).message}` };
  }
  if (!localitate) {
    return {
      error: `eColet nu recunoaste localitatea „${date.oras}" din judetul „${date.judet}". `
        + "Verifica scrierea in adresa comenzii.",
    };
  }

  const addr = (order.shipping_address ?? {}) as Record<string, unknown>;
  const destinatar: AdresaComanda = {
    nume: String(order.customer_name ?? ""),
    strada: String(addr.street ?? addr.address ?? ""),
    numar: String(addr.street_no ?? ""),
    oras: date.oras,
    judet: date.judet,
    localityId: localitate.id,
    codPostal: codPostalDeTrimis(addr.postal_code, localitate.postal_code),
    telefon: String(order.customer_phone ?? ""),
    email: String(order.customer_email ?? ""),
  };

  try {
    const [raspuns, catalog] = await Promise.all([
      coteaza(config, corpExpediere({
        expeditor, destinatar,
        greutateKg: date.greutateKg,
        ramburs: date.ramburs,
        servicii: serviciiDin(config),
      })),
      catalogServicii(config),
    ]);

    const oferte = ofertePosibile(raspuns, catalog, config.servicii_permise);
    return { oferte: oferte.map((o) => ({ ...o, eticheta: etichetaOferta(o) })) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

function serviciiDin(config: EcoletConfig) {
  return {
    deschidereLaLivrare: config.deschidere_la_livrare,
    livrareSambata: config.livrare_sambata,
    smsNotificare: config.sms_notificare,
  };
}

// ─── Emitere ──────────────────────────────────────────────────────────────────

export type DateEcolet = {
  serviciu: string;
  oras: string;
  judet: string;
  greutateKg: number;
  ramburs?: number;
  continut?: string | null;
  observatii?: string | null;
  numeServiciu?: string | null;
};

export type RodEmitere = {
  /** Starea la care s-a ajuns pana la raspuns. AWB-ul poate lipsi inca. */
  stare: "new" | "ordered" | "error";
  awb: string | null;
  eroare: string | null;
};

export async function createEcoletAwbAction(
  businessId: string,
  orderId: string,
  date: DateEcolet,
): Promise<RodEmitere | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const comanda = order as typeof order & ComandaEcolet;

  /*
   * ⚠ GARDA E PE `ecolet_order_to_send_id`, NU PE AWB.
   *
   * Intre `send-order` si `ordered` AWB-ul e NULL, si fereastra aia poate tine
   * minute. O garda pe AWB ar fi goala tocmai atunci, iar a doua apasare pe buton
   * ar crea a doua expediere REALA, facturata.
   */
  if (comanda.ecolet_order_to_send_id) {
    return { error: "Expedierea eColet a fost deja trimisa pentru aceasta comanda" };
  }

  const expeditor = expeditorulDin(config);
  /*
   * ⚠ In `try`: la token expirat sau retea cazuta, `rezolvaLocalitatea` ARUNCA.
   * O actiune de server care arunca nu ajunge la `if ("error" in r)` din formular,
   * deci butonul ramane blocat pe „Se trimite..." si omul nu afla nimic. `null`
   * duce mai jos la mesajul limpede despre localitate nerecunoscuta.
   */
  let localitate: Awaited<ReturnType<typeof rezolvaLocalitatea>> = null;
  try {
    localitate = await rezolvaLocalitatea(config, date.oras, date.judet);
  } catch (e) {
    return { error: `eColet nu a raspuns la cautarea localitatii: ${(e as Error).message}` };
  }

  const destinatarBrut = (order.shipping_address ?? {}) as Record<string, unknown>;
  const destinatar: AdresaComanda = {
    nume: String(order.customer_name ?? ""),
    strada: String(destinatarBrut.street ?? destinatarBrut.address ?? ""),
    numar: String(destinatarBrut.street_no ?? ""),
    oras: date.oras,
    judet: date.judet,
    localityId: localitate?.id ?? 0,
    codPostal: codPostalDeTrimis(destinatarBrut.postal_code, localitate?.postal_code),
    telefon: String(order.customer_phone ?? ""),
    email: String(order.customer_email ?? ""),
  };

  /*
   * ⚠ Toate verificarile care NU ating eColet raman INAINTEA rezervarii: o comanda
   * fara telefon n-are de ce sa ocupe un slot in registru. Si se enumera TOATE
   * lipsurile deodata — raspunsul lor la lipsa e un 422 pe camp, iar un mesaj pe
   * rand ar insemna cinci drumuri pana la formular pentru aceeasi comanda.
   */
  const lipsuri = [
    ...lipsuriAdresa(expeditor, "expeditor"),
    ...lipsuriAdresa(destinatar, "destinatar"),
  ];
  if (lipsuri.length > 0) {
    const dinConfigurare = lipsuri.some((l) => l.includes("expeditor"));
    return {
      error: `eColet cere si campurile astea: ${lipsuri.join(", ")}.`
        + (dinConfigurare ? " Datele expeditorului se completeaza in configurarea eColet." : ""),
    };
  }

  if (!date.serviciu?.trim()) {
    return { error: "Alege un serviciu inainte de a emite." };
  }

  const corp = corpExpediere({
    expeditor,
    destinatar,
    greutateKg: date.greutateKg,
    serviciu: date.serviciu.trim(),
    ramburs: date.ramburs,
    continut: date.continut,
    observatii: date.observatii,
    servicii: serviciiDin(config),
  });

  /*
   * ⚠ SE VALIDEAZA INAINTE DE A CREA, cu chiar endpointul lor pentru asta.
   *
   * `reload-form` e o citire pura si spune doua lucruri pe care altfel le-am afla
   * abia dupa ce transportul exista:
   *
   *   1. daca serviciul ales chiar poate duce comanda ASTA (`statuses[slug]`);
   *   2. daca poate INCASA la livrare (`additional_services[slug].cod`).
   *
   * Al doilea e cel care doare: eColet agrega curieri, iar rambursul nu e o
   * insusire a platformei, ci a fiecarui serviciu — si se poate inchide si pentru
   * o suma prea mare pe un serviciu care altfel il accepta. Fara verificarea asta,
   * marfa ar pleca pe un serviciu fara incasare si banii nu s-ar mai putea lua.
   *
   * ⚠ Un esec de RETEA aici nu opreste emiterea: ar fi o poarta care blocheaza
   * comerciantul pentru o indisponibilitate de o secunda. Se opreste doar cand
   * eColet chiar a raspuns si a spus „nu".
   */
  const deIncasat = Number(date.ramburs) || 0;
  try {
    const [raspuns, catalog] = await Promise.all([coteaza(config, corp), catalogServicii(config)]);
    const oferte = ofertePosibile(raspuns, catalog, config.servicii_permise);
    const aleasa = oferte.find((o) => o.slug === date.serviciu.trim());

    if (!aleasa) {
      return {
        error: oferte.length === 0
          ? "eColet nu poate duce comanda asta cu niciun serviciu. Verifica adresa, greutatea si rambursul."
          : `Serviciul ales nu mai e disponibil pentru comanda asta. Alege dintre: ${oferte.map((o) => o.numeServiciu).join(", ")}.`,
      };
    }
    if (deIncasat > 0 && !aleasa.acceptaRamburs) {
      return {
        error: `${aleasa.numeServiciu} nu incaseaza la livrare pentru comanda asta, iar comanda are `
          + `${deIncasat.toFixed(2)} lei neincasati. Alege alt serviciu sau incaseaza banii inainte.`,
      };
    }
  } catch (e) {
    /* Nu stim: nu blocam. Log, ca sa se vada daca devine un tipar. */
    await logError({
      action: "ecolet.validare",
      message: `Validarea dinaintea emiterii eColet nu s-a putut face: ${(e as Error).message}. Se emite oricum.`,
      details: { orderId, businessId, serviciu: date.serviciu },
      businessId, severity: "info",
    });
  }

  const admin = createAdminClient();
  const r = await cuRegistru(
    admin,
    {
      businessId, orderId,
      fel: "awb",
      furnizor: "ecolet",
      cheie: cheieOperatie("awb", "ecolet", orderId),
    },
    async () => {
      const toSendId = await trimite(config, corp);
      return {
        referinta: String(toSendId),
        detalii: { toSendId, serviciu: date.serviciu },
        valoare: { toSendId },
      };
    },
    verdictFurnizor,
    /*
     * ⚠ NU se da `legaturaVie`, ca la GLS si Pall-Ex. Predicatul pe care il trimit
     * ceilalti curieri e citit dintr-un obiect luat inainte de un `return` care
     * oprea deja executia — deci e constant fals, iar `false` pe ramura `deja`
     * inseamna „elibereaza si REIA", adica a doua expediere reala.
     */
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

  const dinRegistru = (r.fel === "deja" ? r.detalii : null) as { toSendId?: unknown } | null;
  const toSendId = r.fel === "facut"
    ? r.valoare.toSendId
    : Number(dinRegistru?.toSendId) || Number(r.referinta) || 0;

  /*
   * ⚠⚠ „DEJA" DUPA UN REFUZ INREGISTRAT DE CRON.
   *
   * Cronul, cand afla ca brokerul a refuzat, goleste `ecolet_order_to_send_id` de
   * pe comanda dar NU atinge registrul — dinadins, ca sa nu deblocheze o emitere
   * pe care omul o executa chiar atunci. Randul ramane deci `reusit`, iar apasarea
   * urmatoare primeste `deja` si i-ar arata REFUZUL VECHI ca si cum ar fi al ei.
   *
   * ⚠ PRIMA FORMA A REPARATIEI ERA MULT MAI RAU DECAT DEFECTUL.
   *
   * Conditiile ei — „comanda nu mai poarta identificatorul si nici AWB" — sunt
   * amandoua MEREU adevarate aici: garda de la inceputul functiei iese deja daca
   * identificatorul exista, iar AWB-ul nu se scrie niciodata fara el. Deci ramura
   * se reducea la `if (r.fel === "deja")` si facea doua stricaciuni:
   *
   *   1. calea de ADOPTARE de mai jos devenea inaccesibila — tocmai recuperarea
   *      scrierii pierdute, pentru care exista `deja`;
   *   2. slotul se elibera pe orice `deja`, iar `anulat` NU blocheaza rezervarea
   *      urmatoare — deci apasarea de dupa chema `trimite()` din nou: AL DOILEA
   *      TRANSPORT REAL, facturat.
   *
   * Acum se elibereaza doar cu MARTOR POZITIV de refuz (`ecolet_send_state`, pe
   * care il scriu si cronul, si `finalizeaza`, exact cand golesc identificatorul)
   * si numai cand chiar nu mai avem ce adopta.
   */
  if (r.fel === "deja" && !toSendId && comanda.ecolet_send_state === "error") {
    const eliberat = await marcheazaAnulata(admin, businessId, cheieOperatie("awb", "ecolet", orderId));
    if (!eliberat) {
      await logError({
        action: "ecolet.createAwb",
        message: "Incercarea de dinainte a fost refuzata, dar slotul din registru NU s-a eliberat. Comanda ramane blocata pentru emitere.",
        details: { orderId, businessId },
        businessId, severity: "critical",
      });
      return {
        error: "Incercarea de dinainte a fost refuzata de eColet si nu am putut debloca comanda. "
          + "Deblocheaz-o din /admin/operatii sau incearca peste un minut.",
      };
    }
    return {
      error: "Incercarea de dinainte a fost refuzata de eColet si tocmai am eliberat comanda. "
        + "Apasa din nou ca sa trimiti expedierea.",
    };
  }

  if (!toSendId) {
    await logError({
      action: "ecolet.createAwb",
      message: "Expedierea eColet a fost inregistrata in registru fara identificator; nu se poate finaliza.",
      details: { orderId, businessId },
      businessId, severity: "critical",
    });
    return { error: "Expedierea a plecat, dar nu i s-a putut citi identificatorul. Verifica in panel.ecolet.ro." };
  }

  /*
   * ⚠ SE SCRIE INAINTE DE FINALIZARE, si asta e important.
   *
   * `ecolet_awb_at` se pune ACUM, la trimitere, nu cand apare AWB-ul: e ancora
   * ferestrei cronului. Fara ea, o emitere ramasa in „new" n-ar avea de ce sa fie
   * prinsa vreodata de cron, si nimeni n-ar mai finaliza-o.
   */
  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    ecolet_order_to_send_id: toSendId,
    ecolet_send_state: "new",
    ecolet_send_error: null,
    ecolet_service_slug: date.serviciu.trim(),
    ecolet_service_name: date.numeServiciu?.trim() || null,
    ecolet_awb_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  const scrisPeComanda = !eScriere && !!randuri && randuri.length > 0;
  if (!scrisPeComanda) {
    /*
     * ⚠ Expedierea EXISTA la eColet. Un esec de scriere nu are voie sa se intoarca
     * la om ca eroare — l-ar trimite sa apese din nou, iar a doua apasare ar
     * factura al doilea transport. Registrul retine deja operatia.
     */
    await logError({
      action: "ecolet.createAwb",
      message: `Expediere eColet trimisa (to_send ${toSendId}), dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}`,
      details: { orderId, businessId, toSendId, code: eScriere?.code },
      businessId, severity: "critical",
    });
  }

  /* O incercare de finalizare pe loc: de cele mai multe ori eColet raspunde repede. */
  const rod = await finalizeaza(admin, supabase, config, businessId, orderId, toSendId);
  return rod;
}

// ─── Finalizarea emiterii asincrone ───────────────────────────────────────────

/**
 * Duce o emitere de la `order_to_send_id` la AWB.
 *
 * ⚠ Se cheama din DOUA locuri: imediat dupa trimitere (aici raspunde de obicei
 * „new" si atat), si din cronul de urmarire, pentru cele ramase. De aceea e
 * idempotenta si nu presupune nimic despre starea de dinainte.
 *
 * ⚠ O citire picata NU schimba nimic pe comanda: „nu stim" nu e „a esuat".
 */
async function finalizeaza(
  admin: ReturnType<typeof createAdminClient>,
  supabase: Awaited<ReturnType<typeof createClient>>,
  config: EcoletConfig,
  businessId: string,
  orderId: string,
  toSendId: number,
): Promise<RodEmitere> {
  let stare: Awaited<ReturnType<typeof stareaTrimiterii>>;
  try {
    stare = await stareaTrimiterii(config, toSendId);
  } catch {
    /* Nu stim inca. Cronul reia. */
    return { stare: "new", awb: null, eroare: null };
  }
  if (!stare) return { stare: "new", awb: null, eroare: null };

  if (stare.status === "error") {
    /*
     * ⚠ BROKERUL A REFUZAT: nu exista niciun transport. Se elibereaza slotul din
     * registru si se sterge identificatorul de pe comanda, ca sa se poata reincerca
     * dupa corectarea datelor — altfel garda de mai sus ar bloca comanda pentru
     * totdeauna pentru o expediere care nu exista.
     *
     * `ecolet_send_state` si `ecolet_send_error` RAMAN, ca omul sa vada de ce.
     */
    const motiv = (stare.error ?? "").trim() || "eColet a refuzat expedierea, fara sa spuna de ce.";
    const { data: randuri, error: eScriere } = await supabase.from("orders").update({
      ecolet_order_to_send_id: null,
      ecolet_send_state: "error",
      ecolet_send_error: motiv.slice(0, 500),
      ecolet_awb_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId).eq("business_id", businessId).select("id");

    const eliberat = await marcheazaAnulata(admin, businessId, cheieOperatie("awb", "ecolet", orderId));
    /*
     * ⚠ Amandoua se verifica. O eliberare picata lasa randul `reusit` in registru,
     * iar urmatoarea apasare intra pe ramura „deja" si ii arata comerciantului
     * REFUZUL VECHI ca si cum ar fi al incercarii noi — desi n-a plecat nimic.
     */
    if (eScriere || !randuri?.length || !eliberat) {
      await logError({
        action: "ecolet.finalizeaza",
        message: `eColet a refuzat expedierea, dar curatarea a picat (scriere: ${eScriere?.message ?? (randuri?.length ? "ok" : "niciun rand")}, eliberare slot: ${eliberat ? "ok" : "esuata"}). Urmatoarea incercare poate arata refuzul vechi.`,
        details: { orderId, businessId, motiv },
        businessId, severity: "critical",
      });
    }
    return { stare: "error", awb: null, eroare: motiv };
  }

  if (stare.status !== "ordered" || !stare.order_id) {
    return { stare: "new", awb: null, eroare: null };
  }

  /* Gata la ei: se citeste comanda ca sa se afle AWB-ul. */
  let expediere: Awaited<ReturnType<typeof citesteExpedierea>>;
  try {
    expediere = await citesteExpedierea(config, stare.order_id);
  } catch {
    return { stare: "new", awb: null, eroare: null };
  }

  const awb = expediere?.awb?.trim() || null;
  if (!awb) {
    /* „ordered" dar inca fara AWB: se retine `order_id`, restul vine la tura urmatoare. */
    await supabase.from("orders").update({
      ecolet_order_id: stare.order_id,
      ecolet_send_state: "ordered",
      updated_at: new Date().toISOString(),
    }).eq("id", orderId).eq("business_id", businessId);
    return { stare: "ordered", awb: null, eroare: null };
  }

  /* ⚠ Aceeasi regula ca in checkout: `full_name` contine deja curierul, deci
     lipite de mana ieseau „DPD DPD Standard" — si valoarea aia SUPRASCRIA numele
     bun scris la emitere. */
  const numeServiciu = expediere?.service
    ? numeServiciuEcolet(expediere.service.courier_name, expediere.service.full_name) || null
    : null;

  const { data: randuri, error: eScriere } = await supabase.from("orders").update({
    ecolet_order_id: stare.order_id,
    ecolet_awb_number: awb,
    ecolet_send_state: "ordered",
    ecolet_send_error: null,
    ecolet_service_slug: expediere?.service?.slug ?? undefined,
    ...(numeServiciu ? { ecolet_service_name: numeServiciu } : {}),
    /* Conventia brokerilor (Woot, Colete): AWB-ul ajunge si in `tracking_number`. */
    tracking_number: awb,
    status: "processing",
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  if (eScriere || !randuri || randuri.length === 0) {
    await logError({
      action: "ecolet.finalizeaza",
      message: `AWB eColet ${awb} obtinut, dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}`,
      details: { orderId, businessId, awb, orderIdEcolet: stare.order_id },
      businessId, severity: "critical",
    });
  } else {
    /*
     * ⚠ Marketplace-ul afla numarul de urmarire ABIA ACUM, nu la emitere.
     *
     * La ceilalti sapte curieri, `enqueueAboutYouShip` se cheama din actiunea de
     * creare, fiindca acolo AWB-ul exista pe loc. Aici NU exista, deci apelul de
     * acolo ar fi trimis mereu o comanda fara numar — „skipped", adica succes
     * raportat pentru o comanda ramasa neexpediata la marketplace.
     */
    dupaRaspuns(() => enqueueAboutYouShip(businessId, orderId), "enqueueAboutYouShip", businessId);
  }

  return { stare: "ordered", awb, eroare: null };
}

/**
 * Reia finalizarea, la cererea comerciantului.
 *
 * Butonul din formular, pentru cand expedierea a ramas „se emite" mai mult decat
 * se cuvine. Citire + scriere idempotenta; nu trimite nimic nou la eColet.
 */
export async function finalizeazaEcoletAction(
  businessId: string,
  orderId: string,
): Promise<RodEmitere | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const comanda = order as typeof order & ComandaEcolet;
  const toSendId = Number(comanda.ecolet_order_to_send_id);
  if (!Number.isInteger(toSendId) || toSendId <= 0) {
    return { error: "Comanda nu are o expediere eColet in curs." };
  }

  return finalizeaza(createAdminClient(), supabase, config, businessId, orderId, toSendId);
}

// ─── Anulare ──────────────────────────────────────────────────────────────────

/**
 * Anularea expedierii eColet.
 *
 * ═══ ⚠ DOUA CAZURI, NU UNUL ═══
 *
 * 1. Expedierea a ajuns comanda la ei (`ecolet_order_id`): se cheama
 *    `DELETE /order/{id}`.
 * 2. E inca `order_to_send` (fara `order_id`): la eColet nu exista endpoint care
 *    sa opreasca o trimitere in curs. Nu ne prefacem ca am anulat — se spune
 *    limpede ce are omul de facut.
 *
 * Ca la ceilalti curieri, anularea NU trece prin registru (o a doua stergere nu
 * creeaza nimic); ce trebuie neaparat facut e ELIBERAREA slotului, ca urmatoarea
 * emitere sa nu fie refuzata.
 */
export async function deleteEcoletAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const comanda = order as typeof order & ComandaEcolet;
  const orderIdEcolet = Number(comanda.ecolet_order_id);

  if (!Number.isInteger(orderIdEcolet) || orderIdEcolet <= 0) {
    if (comanda.ecolet_order_to_send_id) {
      return {
        error: "Expedierea e inca in curs de creare la eColet si nu se poate anula acum. "
          + "Apasa pe Verifica starea, iar dupa ce primeste AWB o poti anula.",
      };
    }
    return { error: "Nu exista expediere eColet pentru aceasta comanda" };
  }

  let rod: Awaited<ReturnType<typeof anuleaza>>;
  try {
    rod = await anuleaza(config, orderIdEcolet);
  } catch (e) {
    return { error: (e as Error).message };
  }

  if (!rod.sters) {
    return { error: `eColet nu a anulat expedierea: ${rod.motiv}` };
  }

  /*
   * ⚠ Se sterge si memoria urmaririi. Un status ramas de la expedierea anulata
   * s-ar aplica urmatoarei: daca era terminal, `eStareFinala` ar scoate din
   * urmarire expedierea NOUA inainte sa fie interogata vreodata.
   */
  const { data: randuri, error: eScriere } = await supabase.from("orders").update({
    ecolet_order_to_send_id: null,
    ecolet_order_id: null,
    ecolet_awb_number: null,
    ecolet_send_state: null,
    ecolet_send_error: null,
    ecolet_service_slug: null,
    ecolet_service_name: null,
    ecolet_awb_at: null,
    ecolet_status_code: null,
    ecolet_status_checked_at: null,
    /* `tracking_number` e comun pe curieri: se goleste doar daca e chiar al lui. */
    ...(comanda.tracking_number && comanda.tracking_number === comanda.ecolet_awb_number
      ? { tracking_number: null } : {}),
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  /*
   * ⚠ SCRIEREA PICATA OPRESTE ELIBERAREA SLOTULUI, ca la ceilalti curieri:
   * eliberat oricum, comanda ar ramane cu un AWB pe care nimeni nu-l mai poate
   * scoate. Lasat neeliberat, randul ramane `reusit`, iar reincercarea gaseste
   * identificatorul, cheama iar `DELETE`, primeste 404 — pe care il tratam ca
   * disparut — si termina curatenia.
   */
  const scrisPeComanda = !eScriere && !!randuri && randuri.length > 0;
  if (!scrisPeComanda) {
    await logError({
      action: "ecolet.deleteAwb",
      message: `Expedierea eColet ${comanda.ecolet_awb_number ?? orderIdEcolet} a fost anulata la curier, dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}.`,
      details: { orderId, businessId, orderIdEcolet, code: eScriere?.code },
      businessId, severity: "critical",
    });
    return { success: true };
  }

  const eliberat = await marcheazaAnulata(
    createAdminClient(), businessId, cheieOperatie("awb", "ecolet", orderId),
  );
  if (!eliberat) {
    await logError({
      action: "ecolet.deleteAwb",
      message: "Expediere eColet anulata, dar slotul din registru NU s-a eliberat. Urmatoarea emitere va fi refuzata.",
      details: { orderId, businessId },
      businessId, severity: "critical",
    });
  }

  return { success: true };
}

