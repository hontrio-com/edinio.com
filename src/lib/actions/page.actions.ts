"use server";

import { getStoreEmailSender } from "@/lib/email/sender";
import { adreseleLui, destinatarFormular } from "@/lib/pages/destinatar-formular";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { rateLimit, clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { maybeSyncMailchimpSubscriber } from "@/lib/mailchimp-sync";
import { maybeSyncBrevoSubscriber } from "@/lib/brevo-sync";
import { maybeSyncKlaviyoSubscriber } from "@/lib/klaviyo-sync";
import { dupaRaspuns } from "@/lib/marketplace/dupa-raspuns";
import { problemaTitlului, validatePageSlug } from "@/lib/pages/reserved-slugs";
import type { Block, ContactBlock, PageSeo, TipPaginaProprie } from "@/lib/pages/blocks.types";
import type { FormField } from "@/lib/pages/forms.types";
import { campuriFormularSimplu, DURATA_MINIMA_MS, valideazaTrimitere } from "@/lib/pages/validare-formular";
import { TIPURI_PAGINA_PROPRIE } from "@/lib/pages/blocks.types";
import { blocuriSablon, esteSablon, DESPRE_SABLOANE } from "@/lib/pages/sabloane";
import { newMenuItemId } from "@/lib/pages/menu";
import { curataSeoPagina } from "@/lib/pages/pagina-seo";
import type { MenuItem } from "@/lib/pages/menu";
import { sendPageFormEmail } from "@/lib/email";
import type { Database } from "@/types/database.types";
import { esteAdminConfirmat } from "@/lib/admin-guard";
import { FELURI_PERMALINK, permalinkuriDin } from "@/lib/storefront/permalinkuri";

type DB = SupabaseClient<Database>;

const MAX_BLOCKS_BYTES = 400_000; // ~400KB of block JSON per page
const MAX_CSS_PAGINA = 50_000;

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

async function getUserAndBusiness(
  supabase: DB,
  businessId: string,
): Promise<{ userId: string; slug: string | null; isAdmin: boolean } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: biz } = await supabase
    .from("businesses").select("id, slug").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return null;
  const { data: profile } = await supabase
    .from("users_profile").select("role").eq("id", user.id).single();
  return { userId: user.id, slug: biz.slug, isAdmin: esteAdminConfirmat(user, profile?.role) };
}

/**
 * O pagina nu poate lua un prefix CURENT al magazinului (Setari > Permalink-uri):
 * `/<prefix-catalog>` ar fi apoi si catalogul, si pagina. Regula inversa sta in
 * `valideazaPermalinkuri`. Intoarce mesajul de refuz sau null.
 */
async function slugOcupatDePrefix(supabase: DB, businessId: string, slug: string): Promise<string | null> {
  const { data } = await supabase
    .from("store_settings").select("permalinks:page_content->permalinks").eq("business_id", businessId).maybeSingle();
  const p = permalinkuriDin({ permalinks: (data as { permalinks?: unknown } | null)?.permalinks });
  return FELURI_PERMALINK.some((f) => p[f] === slug)
    ? `Linkul "${slug}" e folosit ca prefix de adrese în Setări > Permalink-uri. Alege alt link.`
    : null;
}

/** Unique page slug per business: "contact", "contact-2", ... */
async function resolveUniquePageSlug(
  supabase: DB,
  businessId: string,
  base: string,
  excludePageId?: string,
): Promise<string> {
  const { data: rows } = await supabase
    .from("custom_pages").select("id, slug").eq("business_id", businessId).like("slug", `${base}%`);
  const taken = new Set(
    (rows ?? []).filter((r) => r.id !== excludePageId).map((r) => r.slug),
  );
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * Strip the admin-only `raw` flag from html blocks unless the actor is admin.
 * Recurses into columns so a raw html block hidden inside a column is gated too.
 */
function gateRawBlocks(blocks: Block[], isAdmin: boolean, actorId: string): Block[] {
  return blocks.map((b) => {
    if (b.type === "columns") {
      return {
        ...b,
        items: (b.items ?? []).map((it) =>
          Array.isArray(it.blocks) ? { ...it, blocks: gateRawBlocks(it.blocks, isAdmin, actorId) } : it),
      };
    }
    if (b.type !== "html") return b;
    if (b.raw && !isAdmin) return { ...b, raw: false, rawApprovedBy: null };
    if (b.raw && isAdmin) return { ...b, raw: true, rawApprovedBy: b.rawApprovedBy ?? actorId };
    return b;
  });
}

/** Find a stored block by id, descending into columns' nested blocks. */
function findRawBlockById(
  blocks: Array<Record<string, unknown>>,
  id: string,
): Record<string, unknown> | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (b.type === "columns" && Array.isArray(b.items)) {
      for (const it of b.items as Array<Record<string, unknown>>) {
        if (Array.isArray(it.blocks)) {
          const hit = findRawBlockById(it.blocks as Array<Record<string, unknown>>, id);
          if (hit) return hit;
        }
      }
    }
  }
  return null;
}

function revalidatePage(slug: string | null, pageSlug?: string) {
  revalidatePath("/dashboard/pages");
  if (!slug) return;
  revalidatePath(`/${slug}`);
  if (pageSlug) revalidatePath(`/${slug}/${pageSlug}`);
}

/* ─── CRUD ─────────────────────────────────────────────────────────────────── */

export async function createPage(input: {
  businessId: string; title: string; slug?: string;
  /* 25.09.2026: optiunile ferestrei „Pagina noua”. Toate optionale. */
  sablon?: string;
  tip?: string;
  publicata?: boolean;
  inMeniu?: boolean;
  descriere?: string;
}): Promise<{ error: string } | { success: true; pageId: string; slug: string }> {
  const supabase = await createClient();
  const ctx = await getUserAndBusiness(supabase, input.businessId);
  if (!ctx) return { error: "Neautorizat" };

  const title = input.title.trim();
  if (title.length < 2) return { error: "Titlul paginii e prea scurt." };
  if (title.length > 120) return { error: "Titlul paginii e prea lung (maxim 120 de caractere)." };
  const titluSistem = problemaTitlului(title);
  if (titluSistem) return { error: titluSistem };

  const v = validatePageSlug(input.slug?.trim() || title);
  if (!v.ok) return { error: v.error };
  // Pe slugul FINAL (dupa `-2`, `-3`), nu doar pe cel cerut.
  const slug = await resolveUniquePageSlug(supabase, input.businessId, v.slug);
  const ocupat = await slugOcupatDePrefix(supabase, input.businessId, slug);
  if (ocupat) return { error: ocupat };

  /*
   * Sablonul si tipul se hotarasc AICI, din chei cunoscute. Nimic din ce vine
   * de la client nu ajunge direct in coloane: un sablon necunoscut e pagina
   * goala, un tip necunoscut e „pagina”.
   */
  const sablon = esteSablon(input.sablon) ? input.sablon : "goala";
  const tip: TipPaginaProprie = TIPURI_PAGINA_PROPRIE.some((t) => t.valoare === input.tip)
    ? (input.tip as TipPaginaProprie)
    : DESPRE_SABLOANE[sablon].tip;
  const descriere = (input.descriere ?? "").trim().slice(0, 300);
  const seo = curataSeoPagina({ tip, ...(descriere ? { description: descriere } : {}) } as PageSeo);

  const { data, error } = await supabase
    .from("custom_pages")
    .insert({
      business_id: input.businessId, title, slug,
      blocks: gateRawBlocks(blocuriSablon(sablon, title), ctx.isAdmin, ctx.userId) as never,
      is_published: input.publicata === true,
      seo: seo as never,
    })
    .select("id, slug")
    .single();

  if (error || !data) {
    logError({ action: "createPage", message: error?.message ?? "no row", details: { businessId: input.businessId }, userId: ctx.userId });
    return { error: "Eroare la crearea paginii." };
  }

  /*
   * In meniu, daca a cerut. O cadere aici NU desface pagina: ea exista deja si
   * se poate pune in meniu din lista, cu o bifa. De aceea doar se jurnalizeaza.
   */
  if (input.inMeniu) {
    const eroare = await adaugaInMeniu(supabase, input.businessId, { label: title, target: data.slug });
    if (eroare) logError({ action: "createPage.meniu", message: eroare, details: { businessId: input.businessId, pageId: data.id }, userId: ctx.userId });
  }

  revalidatePage(ctx.slug, data.slug);
  return { success: true, pageId: data.id, slug: data.slug };
}

/** Pune o pagina la capatul meniului, fara sa atinga restul `page_content`. */
async function adaugaInMeniu(supabase: DB, businessId: string, p: { label: string; target: string }): Promise<string | null> {
  const { data: existing } = await supabase
    .from("store_settings").select("page_content").eq("business_id", businessId).maybeSingle();
  const pc = (existing?.page_content as Record<string, unknown> | null) ?? {};
  const menu = Array.isArray(pc.menu) ? (pc.menu as MenuItem[]) : [];
  if (menu.some((m) => m.type === "page" && m.target === p.target)) return null;
  const next = { ...pc, menu: [...menu, { id: newMenuItemId(), type: "page", label: p.label, target: p.target }] };
  const { error } = existing
    ? await supabase.from("store_settings").update({ page_content: next as never, updated_at: new Date().toISOString() }).eq("business_id", businessId)
    : await supabase.from("store_settings").insert({ business_id: businessId, page_content: next as never });
  return error?.message ?? null;
}

export async function updatePage(
  pageId: string,
  patch: {
    title?: string; slug?: string; blocks?: Block[]; page_css?: string | null; seo?: PageSeo; is_published?: boolean;
    /**
     * `updated_at` al paginii asa cum l-a incarcat editorul. Cand e dat, salvarea
     * trece numai daca pagina n-a fost salvata intre timp din alta parte.
     */
    versiune?: string;
  },
): Promise<{ error: string; conflict?: true } | { success: true; slug: string; versiune: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  // Resolve the page + its business (ownership enforced via RLS + explicit check).
  const { data: page } = await supabase
    .from("custom_pages").select("id, business_id, slug, title, updated_at").eq("id", pageId).single();
  if (!page) return { error: "Pagina negasita" };

  const ctx = await getUserAndBusiness(supabase, page.business_id);
  if (!ctx) return { error: "Neautorizat" };

  const acum = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: acum };

  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (t.length < 2) return { error: "Titlul paginii e prea scurt." };
    if (t.length > 120) return { error: "Titlul paginii e prea lung (maxim 120 de caractere)." };
    // Numai un titlu SCHIMBAT: o pagina veche nu se blocheaza la salvare pentru un nume pe care il avea deja.
    if (t !== page.title) {
      const titluSistem = problemaTitlului(t);
      if (titluSistem) return { error: titluSistem };
    }
    update.title = t;
  }

  let nextSlug = page.slug;
  if (patch.slug !== undefined) {
    const v = validatePageSlug(patch.slug);
    if (!v.ok) return { error: v.error };
    nextSlug = await resolveUniquePageSlug(supabase, page.business_id, v.slug, pageId);
    const ocupat = nextSlug === page.slug ? null : await slugOcupatDePrefix(supabase, page.business_id, nextSlug);
    if (ocupat) return { error: ocupat };
    update.slug = nextSlug;
  }

  if (patch.blocks !== undefined) {
    const gated = gateRawBlocks(patch.blocks, ctx.isAdmin, ctx.userId);
    if (JSON.stringify(gated).length > MAX_BLOCKS_BYTES) {
      return { error: "Pagina e prea mare. Imparte continutul sau elimina blocuri." };
    }
    update.blocks = gated;
  }
  if (patch.page_css !== undefined) {
    // Plafon (auditul din 26.09.2026): coloana primea orice, de orice marime. In productie: zero pagini cu CSS.
    if (typeof patch.page_css === "string" && patch.page_css.length > MAX_CSS_PAGINA) {
      return { error: `CSS-ul paginii poate avea cel mult ${MAX_CSS_PAGINA.toLocaleString("ro-RO")} de caractere.` };
    }
    update.page_css = typeof patch.page_css === "string" ? patch.page_css : null;
  }
  /*
   * `seo` trece prin lista alba INAINTE de coloana, nu doar la citire.
   *
   * Coloana e `Json`, deci accepta orice; iar de acolo, campurile ajung in
   * `<script type="application/ld+json">` pe pagina publica. Curatat doar la
   * citire, gunoiul ar fi ramas in baza si ar fi calatorit mai departe la
   * fiecare duplicare. Vezi `curataSeoPagina`.
   */
  if (patch.seo !== undefined) update.seo = curataSeoPagina(patch.seo) as never;
  if (patch.is_published !== undefined) update.is_published = patch.is_published;

  /*
   * ⚠⚠ DOUA FILE, O SINGURA PAGINA (25.09.2026).
   *
   * Salvarea trimite TOT continutul, deci pana acum ultima fila care salva
   * stergea tacut ce se salvase din cealalta: blocuri adaugate, SEO, titlu.
   * Acum editorul trimite versiunea pe care a incarcat-o, iar randul se scrie
   * numai daca e inca aceea. Altfel omul afla, in loc sa piarda munca.
   */
  let cerere = supabase.from("custom_pages").update(update as never).eq("id", pageId);
  if (patch.versiune) cerere = cerere.eq("updated_at", patch.versiune);
  const { data: scrise, error } = await cerere.select("updated_at");
  if (error) {
    logError({ action: "updatePage", message: error.message, details: { pageId }, userId: user.id });
    return { error: "Eroare la salvarea paginii." };
  }
  if (!scrise || scrise.length === 0) {
    return {
      error: "Pagina a fost salvată între timp din altă parte (altă filă sau alt dispozitiv). Ca să nu pierzi nimic, copiază ce ai schimbat, reîncarcă editorul și aplică din nou.",
      conflict: true,
    };
  }
  if (nextSlug !== page.slug) await mutaPaginaInMeniu(supabase, page.business_id, page.slug, nextSlug);
  revalidatePage(ctx.slug, nextSlug);
  if (nextSlug !== page.slug) revalidatePage(ctx.slug, page.slug); // old URL too
  return { success: true, slug: nextSlug, versiune: scrise[0].updated_at };
}

/*
 * Meniul urmeaza pagina redenumita (26.09.2026, auditul paginilor). Intrarile de
 * meniu tin pagina dupa ADRESA (`target: slug`), deci o adresa schimbata lasa in
 * meniu o legatura spre 404, iar bifa „In meniu” disparea din lista de pagini.
 * Nu e exportata: fisierul e "use server", orice export ar fi un capat public.
 */
async function mutaPaginaInMeniu(supabase: Awaited<ReturnType<typeof createClient>>, businessId: string, vechi: string, nou: string) {
  const { data } = await supabase.from("store_settings").select("page_content").eq("business_id", businessId).maybeSingle();
  const pc = (data?.page_content ?? null) as Record<string, unknown> | null;
  const meniu = Array.isArray(pc?.menu) ? (pc.menu as { type?: string; target?: string }[]) : null;
  if (!pc || !meniu || !meniu.some((i) => i?.type === "page" && i.target === vechi)) return;
  const nouMeniu = meniu.map((i) => (i?.type === "page" && i.target === vechi ? { ...i, target: nou } : i));
  const { error } = await supabase.from("store_settings")
    .update({ page_content: { ...pc, menu: nouMeniu } as never, updated_at: new Date().toISOString() })
    .eq("business_id", businessId);
  if (error) logError({ action: "updatePage.meniu", message: error.message, details: { businessId, vechi, nou } });
}

export async function deletePage(pageId: string): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: page } = await supabase
    .from("custom_pages").select("id, business_id, slug").eq("id", pageId).single();
  if (!page) return { error: "Pagina negasita" };

  /*
   * Singura din familie care nu cerea proprietarul (createPage, updatePage,
   * duplicatePage si updateStoreMenu il cer toate). Citirea de mai sus reuseste
   * si pentru pagina PUBLICATA a altui magazin — exista politica publica de
   * SELECT — deci autorizarea atarna doar de RLS. Azi RLS chiar tine, dar in
   * clipa in care apare o politica DELETE mai larga sau cineva trece pe clientul
   * de admin (cum s-a intamplat in deleteSubmission), linia asta e tot ce mai
   * sta intre chiriasi.
   */
  const ctx = await getUserAndBusiness(supabase, page.business_id);
  if (!ctx) return { error: "Neautorizat" };

  // `.select("id")` nu e decorativ: un DELETE care nu potriveste niciun rand nu
  // da eroare, iar functia raspundea {success:true} pentru o stergere care NU
  // s-a intamplat — confirmare falsa in interfata.
  const { data: sterse, error } = await supabase
    .from("custom_pages").delete().eq("id", pageId).select("id");
  if (error) return { error: "Eroare la stergerea paginii." };
  if (!sterse || sterse.length === 0) return { error: "Neautorizat" };

  revalidatePage(ctx.slug, page.slug);
  return { success: true };
}

export async function duplicatePage(pageId: string): Promise<{ error: string } | { success: true; pageId: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: src } = await supabase
    .from("custom_pages").select("*").eq("id", pageId).single();
  if (!src) return { error: "Pagina negasita" };

  const ctx = await getUserAndBusiness(supabase, src.business_id);
  if (!ctx) return { error: "Neautorizat" };

  const slug = await resolveUniquePageSlug(supabase, src.business_id, `${src.slug}-copie`);
  const ocupat = await slugOcupatDePrefix(supabase, src.business_id, slug);
  if (ocupat) return { error: ocupat };
  const { data, error } = await supabase
    .from("custom_pages")
    .insert({
      business_id: src.business_id,
      title: `${src.title} (copie)`,
      slug,
      blocks: src.blocks as never,
      page_css: src.page_css,
      /*
       * ⚠ Data publicarii NU se copiaza.
       *
       * Randul nou primeste `created_at`-ul lui, deci o copie care mosteneste
       * `dataPublicarii` ar purta doua date care se contrazic — si tocmai cea
       * declarata bate, adica articolul nou ar aparea in Google cu data
       * articolului din care a fost copiat. Restul campurilor SEO se pastreaza:
       * o copie porneste de la aceleasi setari, asta e rostul ei.
       */
      seo: curataSeoPagina({ ...((src.seo ?? {}) as PageSeo), dataPublicarii: undefined }) as never,
      is_published: false,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Eroare la duplicarea paginii." };
  revalidatePage(ctx.slug, slug);
  return { success: true, pageId: data.id };
}

/* ─── Navigation menu (store_settings.page_content.menu) ───────────────────── */

export async function updateStoreMenu(
  businessId: string,
  items: MenuItem[],
  /**
   * Comerciantul a scos intrarea „Acasa" din meniu.
   *
   * Se salveaza ca steag, nu prin absenta ei din lista: intrarea e implicita, iar
   * fara steag `meniuCuAcasa` ar fi pus-o la loc la urmatoarea randare si
   * stergerea n-ar fi tinut niciodata.
   */
  faraAcasa?: boolean,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const ctx = await getUserAndBusiness(supabase, businessId);
  if (!ctx) return { error: "Neautorizat" };

  // Merge into existing page_content so we don't clobber other store config.
  const { data: existing } = await supabase
    .from("store_settings").select("id, page_content").eq("business_id", businessId).single();

  const clean = items
    .filter((i) => i.label?.trim())
    .map((i) => ({ id: i.id, type: i.type, label: i.label.trim(), target: i.target?.trim() || undefined }));

  let error;
  if (existing) {
    const pc = { ...(existing.page_content as Record<string, unknown> | null ?? {}), menu: clean, menu_fara_acasa: faraAcasa === true };
    ({ error } = await supabase.from("store_settings")
      .update({ page_content: pc as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId));
  } else {
    ({ error } = await supabase.from("store_settings")
      .insert({ business_id: businessId, page_content: { menu: clean, menu_fara_acasa: faraAcasa === true } as never }));
  }
  if (error) {
    logError({ action: "updateStoreMenu", message: error.message, details: { businessId }, userId: ctx.userId });
    return { error: "Eroare la salvarea meniului." };
  }
  if (ctx.slug) revalidatePath(`/${ctx.slug}`);
  revalidatePath("/dashboard/pages");
  return { success: true };
}

/* ─── Public form submission ───────────────────────────────────────────────── */

export async function submitPageForm(input: {
  businessId: string;
  formId?: string | null;
  pageId?: string;
  blockId?: string;
  fields: { id?: string; label: string; value: string }[];
  honeypot?: string;
  /** Cat a stat formularul pe ecran pana la trimitere, in ms (capcana pentru roboti). */
  durata?: number;
}): Promise<{ error: string } | { success: true }> {
  // Bot trap: a filled honeypot pretends to succeed without doing anything.
  if (input.honeypot && input.honeypot.trim() !== "") return { success: true };
  /*
   * A doua capcana (26.09.2026): un om nu completeaza un formular in sub o
   * secunda. Robotul primeste „reusit”, ca sa nu invete ce l-a oprit, si nu se
   * scrie nimic. Lipsa campului (un apelant vechi) nu e pedepsita.
   */
  if (typeof input.durata === "number" && input.durata >= 0 && input.durata < DURATA_MINIMA_MS) return { success: true };

  let fields = (input.fields ?? [])
    .filter((f) => f && typeof f.label === "string")
    .slice(0, 40)
    .map((f) => ({ id: typeof f.id === "string" ? f.id.slice(0, 80) : undefined, label: String(f.label).slice(0, 120), value: String(f.value ?? "").slice(0, 5000) }));
  if (fields.length === 0) return { error: "Formular gol." };

  /*
   * Plafon PE IP. Pana acum singurul plafon era pe MAGAZIN (8 mesaje/minut), ceea
   * ce se intorcea impotriva comerciantului: un atacator trimitea el cele 8
   * mesaje si formularul devenea inutilizabil pentru clientii REALI — o negare de
   * serviciu tintita, cu efort minim.
   */
  const ip = clientIpFromHeaders(await headers());
  if (!rateLimit(`pageForm:${ip}`, 5, 60_000)) {
    return { error: "Prea multe mesaje trimise. Te rugam asteapta un minut." };
  }
  if (!(await consumaLimita(`formular:ip:${ip}`, 60, 3600)).permis) {
    return { error: "Prea multe mesaje trimise. Te rugam incearca mai tarziu." };
  }

  const admin = createAdminClient();

  // Light burst limit: cap submissions per business in the last minute.
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin
    .from("page_form_submissions")
    .select("id", { count: "exact", head: true })
    .eq("business_id", input.businessId)
    .gte("created_at", since);
  /*
   * Doua praguri, nu unul.
   *
   * DUR (60): opreste inundarea tabelei. Un magazin real nu-l atinge niciodata.
   * MOALE (8): mesajul se SALVEAZA in continuare si comerciantul il vede in
   * panou, dar nu mai pleaca emailuri. Asa, o rafala nu mai poate face mesajul
   * unui client real sa DISPARA — ceea ce se intampla cu pragul unic de dinainte.
   */
  if ((count ?? 0) >= 60) return { error: "Prea multe mesaje. Incearca din nou peste un minut." };
  const pesteRafala = (count ?? 0) >= 8;

  const { data: biz } = await admin
    .from("businesses")
    .select("id, business_name, store_name, slug, custom_domain, email, user_id, is_published")
    .eq("id", input.businessId)
    .single();
  if (!biz || !biz.is_published) return { error: "Magazin indisponibil." };

  // Resolve email settings SERVER-SIDE. The recipient is never taken from the
  // client (prevents using the form as an open relay / spam amplifier).
  let emailEnabled = false;
  let emailTo = "";
  let title = "Formular";
  let formId: string | null = null;
  let mailchimpEnabled = false;
  let brevoEnabled = false;
  let klaviyoEnabled = false;

  /*
   * ⚠⚠ RASPUNSUL SE RECONSTRUIESTE DIN DEFINITIE (26.09.2026). Pana acum se scria
   * ce trimitea browserul: campuri inventate, obligatorii lipsa, „email”-uri
   * care nu erau email. Vezi `valideazaTrimitere`. Un formular sau un bloc care
   * nu mai exista nu primeste nimic.
   */
  let definitie: FormField[] | null = null;

  /*
   * Pagina de pe care vine trimiterea (auditul din 26.09.2026): trebuie sa fie a
   * ACESTUI magazin si publicata. Pana acum blocul simplu de pe o ciorna primea
   * mesaje, iar `page_id` se scria asa cum venea, fara verificare.
   */
  let pagina: { blocks: unknown; title: string } | null = null;
  if (input.pageId) {
    const { data } = await admin
      .from("custom_pages").select("blocks, title, is_published")
      .eq("id", input.pageId).eq("business_id", biz.id).maybeSingle();
    if (!data || !data.is_published) return { error: "Pagina nu mai este disponibilă. Reîncarcă pagina." };
    pagina = data;
  }

  if (input.formId) {
    const { data: form } = await admin
      .from("forms").select("id, name, fields, email_enabled, email_to, mailchimp_enabled, brevo_enabled, klaviyo_enabled")
      .eq("id", input.formId).eq("business_id", biz.id).single();
    if (form) {
      definitie = Array.isArray(form.fields) ? (form.fields as unknown as FormField[]) : [];
      formId = form.id;
      title = form.name;
      emailEnabled = form.email_enabled;
      emailTo = (form.email_to ?? "").trim();
      mailchimpEnabled = form.mailchimp_enabled;
      brevoEnabled = form.brevo_enabled ?? false;
      klaviyoEnabled = form.klaviyo_enabled ?? false;
    }
  } else if (pagina && input.blockId) {
    // Built-in contact block: read its opt-in flag from the stored page (trusted).
    const page = pagina;
    const blocks = (page.blocks as Array<Record<string, unknown>> | null) ?? [];
    const block = findRawBlockById(blocks, input.blockId);
    if (block && block.type === "contact") definitie = campuriFormularSimplu(block as unknown as ContactBlock);
    if (block && block.emailEnabled === true) emailEnabled = true;
    if (page.title) title = page.title;
  }
  if (!definitie) return { error: "Formularul nu mai există pe pagină. Reîncarcă pagina." };
  const verificat = valideazaTrimitere(definitie, fields);
  if ("error" in verificat) return { error: verificat.error };
  fields = verificat.campuri.map((c) => ({ id: undefined, ...c }));

  const { error } = await admin.from("page_form_submissions").insert({
    business_id: biz.id,
    page_id: input.pageId ?? null,
    block_id: input.blockId ?? null,
    form_id: formId,
    data: { fields: fields.map(({ label, value }) => ({ label, value })) } as never,
  });
  if (error) {
    logError({ action: "submitPageForm", message: error.message, details: { businessId: input.businessId } });
    return { error: "Eroare la trimitere. Incearca din nou." };
  }

  // Mailchimp — a signup form flagged for sync adds the submitter as a subscriber. Fire-and-forget.
  if (mailchimpEnabled) {
    const emailVal = fields.find((f) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value))?.value;
    if (emailVal) {
      const nameVal = fields.find((f) => /nume|name/i.test(f.label))?.value;
      const phoneVal = fields.find((f) => /telefon|phone|mobil/i.test(f.label))?.value;
      dupaRaspuns(() => maybeSyncMailchimpSubscriber({ businessId: biz.id, source: "forms", email: emailVal, name: nameVal, phone: phoneVal, tags: title ? [title] : undefined }), "maybeSyncMailchimpSubscriber", biz.id);
    }
  }

  // Brevo — a signup form flagged for sync adds the submitter as a subscriber. Fire-and-forget.
  if (brevoEnabled) {
    const emailVal = fields.find((f) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value))?.value;
    if (emailVal) {
      const nameVal = fields.find((f) => /nume|name/i.test(f.label))?.value;
      const phoneVal = fields.find((f) => /telefon|phone|mobil/i.test(f.label))?.value;
      dupaRaspuns(() => maybeSyncBrevoSubscriber({ businessId: biz.id, source: "forms", email: emailVal, name: nameVal, phone: phoneVal }), "maybeSyncBrevoSubscriber", biz.id);
    }
  }

  // Klaviyo — a signup form flagged for sync adds the submitter as a subscriber. Fire-and-forget.
  if (klaviyoEnabled) {
    const emailVal = fields.find((f) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value))?.value;
    if (emailVal) {
      const nameVal = fields.find((f) => /nume|name/i.test(f.label))?.value;
      const phoneVal = fields.find((f) => /telefon|phone|mobil/i.test(f.label))?.value;
      dupaRaspuns(() => maybeSyncKlaviyoSubscriber({ businessId: biz.id, source: "forms", email: emailVal, name: nameVal, phone: phoneVal }), "maybeSyncKlaviyoSubscriber", biz.id);
    }
  }

  // Email the merchant ONLY when they opted in. Recipient is server-trusted.
  // Peste pragul moale mesajul e deja salvat; nu mai trimitem si emailuri, ca o
  // rafala sa nu inunde cutia postala a comerciantului.
  if (emailEnabled && !pesteRafala) {
    try {
      /*
       * ⚠⚠ DESTINATARUL SI DRUMUL (25-26.09.2026), vezi `destinatarFormular`.
       *
       * `email_to` se poate scrie si direct prin PostgREST (politica RLS pe `forms`
       * e `ALL`), iar formularul e public: fara SMTP propriu, o adresa straina ar fi
       * facut din expeditorul PLATFORMEI un releu de spam. Deci: fara SMTP, numai
       * adresele lui (magazinul, contul); cu SMTP, orice adresa, dar numai prin
       * SMTP-ul lui, fara rezerva pe Edinio. Adresa din tabel se verifica AICI din
       * nou, nu doar la salvare.
       */
      const { data: u } = await admin.auth.admin.getUserById(biz.user_id);
      const sender = await getStoreEmailSender(admin, biz.id);
      const { to, liber } = destinatarFormular(emailTo, adreseleLui(biz.email, u.user?.email), !!sender?.smtp);
      if (to) {
        const storeName = biz.store_name ?? biz.business_name;
        const radacina = biz.custom_domain
          ? `https://${biz.custom_domain}`
          : `https://www.edinio.com/${biz.slug}`;
        // „Vezi pagina” ducea la radacina magazinului; acum duce la pagina formularului.
        let pageUrl = radacina;
        if (input.pageId) {
          const { data: pg } = await admin.from("custom_pages").select("slug").eq("id", input.pageId).eq("business_id", biz.id).maybeSingle();
          if (pg?.slug) pageUrl = `${radacina}/${pg.slug}`;
        }
        // „Raspunde” din casuta comerciantului merge la omul care a scris, cand a lasat un email.
        const replyTo = fields.find((f) => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(f.value.trim()))?.value.trim();
        await sendPageFormEmail(to, { storeName, pageTitle: title, pageUrl, fields: fields.map(({ label, value }) => ({ label, value })), replyTo },
          { sender, faraRezervaEdinio: liber });
      }
    } catch (e) {
      logError({ action: "submitPageForm.email", message: e instanceof Error ? e.message : "email failed", details: { businessId: input.businessId } });
    }
  }

  return { success: true };
}

/* ─── Newsletter (blocul „Newsletter”, 25.09.2026) ─────────────────────────── */

/**
 * Abonarea din blocul de newsletter al unei pagini proprii, catre furnizorii
 * conectati (Mailchimp, Brevo, Klaviyo), cu sursa „Formular”.
 *
 * ⚠ ACORDUL E OBLIGATORIU, si pe server. Formularele proprii sincronizau pana
 * acum primul camp care arata a email fara nicio bifa; aici fara `acord: true`
 * nu pleaca nimic nicaieri.
 *
 * ⚠ Ce anume se cere (nume, telefon) si eticheta se citesc din BLOCUL SALVAT,
 * nu din cerere: altfel oricine ar fi pus orice eticheta in lista magazinului.
 *
 * ⚠ Abonarea se pastreaza si in „Mesaje”, ca sa existe o urma la noi chiar cand
 * furnizorul raspunde cu eroare (sincronizarea e „fire-and-forget”).
 */
export async function aboneazaNewsletter(input: {
  businessId: string;
  pageId: string;
  blockId: string;
  email: string;
  nume?: string;
  telefon?: string;
  acord: boolean;
  honeypot?: string;
}): Promise<{ error: string } | { success: true }> {
  if (input.honeypot && input.honeypot.trim() !== "") return { success: true };
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) return { error: "Adresa de email nu pare corectă." };
  if (input.acord !== true) return { error: "Bifează acordul ca să te poți abona." };

  const ip = clientIpFromHeaders(await headers());
  if (!rateLimit(`newsletter:${ip}`, 5, 60_000)) return { error: "Prea multe încercări. Așteaptă un minut." };
  if (!(await consumaLimita(`newsletter:ip:${ip}`, 30, 3600)).permis) return { error: "Prea multe încercări. Încearcă mai târziu." };

  const admin = createAdminClient();
  const { data: biz } = await admin.from("businesses").select("id, is_published").eq("id", input.businessId).single();
  if (!biz || !biz.is_published) return { error: "Magazin indisponibil." };

  const { data: page } = await admin
    .from("custom_pages").select("blocks, is_published")
    .eq("id", input.pageId).eq("business_id", biz.id).single();
  const block = page?.is_published ? findRawBlockById((page.blocks as Array<Record<string, unknown>> | null) ?? [], input.blockId) : null;
  if (!block || block.type !== "newsletter") return { error: "Formularul nu mai există pe pagină." };

  const nume = block.askName === true ? String(input.nume ?? "").trim().slice(0, 120) : "";
  const telefon = block.askPhone === true ? String(input.telefon ?? "").trim().slice(0, 40) : "";
  const eticheta = typeof block.tag === "string" && block.tag.trim() ? block.tag.trim().slice(0, 60) : "Newsletter";

  const campuri = [
    { label: "Email", value: email },
    ...(nume ? [{ label: "Nume", value: nume }] : []),
    ...(telefon ? [{ label: "Telefon", value: telefon }] : []),
    { label: "Acord newsletter", value: "Da" },
  ];
  const { error } = await admin.from("page_form_submissions").insert({
    business_id: biz.id, page_id: input.pageId, block_id: input.blockId, form_id: null,
    data: { fields: campuri, newsletter: true } as never,
  });
  if (error) {
    logError({ action: "aboneazaNewsletter", message: error.message, details: { businessId: biz.id } });
    return { error: "Nu am putut înregistra abonarea. Încearcă din nou." };
  }

  const comun = { businessId: biz.id, source: "forms" as const, email, name: nume || undefined, phone: telefon || undefined };
  dupaRaspuns(() => maybeSyncMailchimpSubscriber({ ...comun, tags: [eticheta] }), "maybeSyncMailchimpSubscriber", biz.id);
  dupaRaspuns(() => maybeSyncBrevoSubscriber(comun), "maybeSyncBrevoSubscriber", biz.id);
  dupaRaspuns(() => maybeSyncKlaviyoSubscriber(comun), "maybeSyncKlaviyoSubscriber", biz.id);
  return { success: true };
}
