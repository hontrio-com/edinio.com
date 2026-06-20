"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  Info, Palette, MapPin, Share2, Globe,
  ChevronDown, ChevronUp, Save, Loader2, Check, ExternalLink, Upload, X, Plus,
  Layout, Smartphone, Monitor, Home, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { updateBusiness } from "@/lib/actions/business.actions";
import { updatePageContent } from "@/lib/actions/store.actions";
import type { Database } from "@/types/database.types";

type Business = Database["public"]["Tables"]["businesses"]["Row"];
type StoreSettings = Database["public"]["Tables"]["store_settings"]["Row"];

interface Social { facebook?: string; instagram?: string; tiktok?: string; youtube?: string; }
interface Features { floating_whatsapp?: boolean; floating_call?: boolean; }
interface BannerItem { id: string; url: string; file: File | null; link?: string; }

interface PageContent {
  announcement_bar?: { enabled: boolean; text: string; bg_color: string; speed?: number; };
  trust_badges_enabled?: boolean;
  trust_badges?: Array<{ icon: string; title: string; desc: string; }>;
  show_trust_strip_on_store?: boolean;
  store_trust_badges?: Array<{ icon: string; title: string; desc: string; }>;
  show_featured_section?: boolean;
  featured_section_title?: string;
  show_shipping_progress?: boolean;
  store_benefits_section?: { enabled: boolean; title: string; items: Array<{ title: string; desc: string; }>; };
  benefits_section?: { enabled: boolean; title: string; items: Array<{ title: string; desc: string; }>; };
  reviews_section?: { enabled: boolean; title: string; items: Array<{ name: string; rating: number; text: string; date: string; image?: string; }>; };
  checkout_config?: {
    custom_fields?: Array<{ id: string; label: string; type: "text" | "textarea" | "select" | "checkbox"; options?: string; required: boolean; placeholder?: string; }>;
    extras?: Array<{ id: string; label: string; price: number; description?: string; }>;
    hidden_fields?: string[];
    email_field?: { enabled: boolean; required: boolean };
  };
  how_it_works_section?: { enabled: boolean; title: string; steps: Array<{ title: string; desc: string; }>; };
  faq_section?: { enabled: boolean; title: string; items: Array<{ q: string; a: string; }>; };
  button_effect?: string;
  show_announcement_on_store?: boolean;
  sort_options?: { enabled: boolean; default_sort?: string; };
  sticky_cart_bar?: { enabled: boolean; };
  new_badge?: { enabled: boolean; days: number; };
  image_zoom?: { enabled: boolean; };
  delivery_estimate?: { enabled: boolean; min_days: number; max_days: number; text?: string; };
  show_social_proof?: boolean;
  show_quality_badge?: boolean;
  show_category_badges?: boolean;
  hide_edinio_badge?: boolean;
  store_bg_color?: string;
  logo_size?: number;
  footer_logo_size?: number;
  favicon_url?: string | null;
  hero_show_content?: boolean;
  hero_banners?: string[];
  hero_banner_links?: string[];
}

const inputCls = "w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors";

const COLOR_PRESETS = [
  "#1AB554", "#1E3A5F", "#8B1A1A", "#374151", "#D97706", "#6D28D9", "#E11D48", "#0891B2",
];

// ─── Sub-components ───────────────────────────────────────────

function SectionHeader({ icon: Icon, title, open, onToggle }: {
  icon: React.ComponentType<{ className?: string }>; title: string; open: boolean; onToggle: () => void;
}) {
  return (
    <button type="button" onClick={onToggle}
      className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
    </button>
  );
}

function SaveBtn({ loading, saved, onSave }: { loading: boolean; saved: boolean; onSave: () => void }) {
  return (
    <div className="pt-3 flex justify-end">
      <button type="button" onClick={onSave} disabled={loading}
        className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all bg-primary text-white hover:bg-primary/90 disabled:opacity-60">
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : saved ? <Check className="h-3 w-3" /> : <Save className="h-3 w-3" />}
        {saved ? "Salvat" : "Salveaza"}
      </button>
    </div>
  );
}

function ImageUploadField({ label, preview, aspectRatio, onFile, onRemove }: {
  label: string; preview: string | null; aspectRatio: string; onFile: (f: File) => void; onRemove: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
      {preview ? (
        <div className="relative rounded-lg overflow-hidden border border-border" style={{ aspectRatio }}>
          <img src={preview} alt="" className="w-full h-full object-cover" />
          <button type="button" onClick={onRemove}
            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 border border-border flex items-center justify-center hover:bg-white transition-colors">
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div onClick={() => ref.current?.click()} style={{ aspectRatio, minHeight: "80px" }}
          className="border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
          <Upload className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Incarca imagine</span>
          <input ref={ref} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        </div>
      )}
    </div>
  );
}

// ─── Effect preview ───────────────────────────────────────────

function EffectPreview({ id, label, color, selected, onClick }: {
  id: string; label: string; color: string; selected: boolean; onClick: () => void;
}) {
  const cls = "w-full py-1.5 text-[10px] font-bold text-white rounded-md text-center select-none";

  let preview: React.ReactNode;
  if (id === "pulse") {
    preview = (
      <div className="relative">
        <motion.div className="absolute inset-0 rounded-md pointer-events-none"
          style={{ backgroundColor: color }}
          animate={{ opacity: [0.7, 0], scale: [1, 1.25] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }} />
        <div className={cls} style={{ backgroundColor: color }}>{label}</div>
      </div>
    );
  } else if (id === "shake") {
    preview = (
      <motion.div className={cls} style={{ backgroundColor: color }}
        animate={{ x: [0, -4, 4, -4, 4, 0] }}
        transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}>
        {label}
      </motion.div>
    );
  } else if (id === "bounce") {
    preview = (
      <motion.div className={cls} style={{ backgroundColor: color }}
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 0.7, repeat: Infinity, ease: "easeInOut" }}>
        {label}
      </motion.div>
    );
  } else if (id === "glow") {
    preview = (
      <motion.div className={cls}
        style={{ backgroundColor: color }}
        animate={{ boxShadow: [`0px 1px 4px ${color}44`, `0px 2px 16px ${color}CC`, `0px 1px 4px ${color}44`] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}>
        {label}
      </motion.div>
    );
  } else if (id === "heartbeat") {
    preview = (
      <motion.div className={cls} style={{ backgroundColor: color }}
        animate={{ scale: [1, 1.08, 1, 1.08, 1] }}
        transition={{ duration: 1, repeat: Infinity, repeatDelay: 1.5 }}>
        {label}
      </motion.div>
    );
  } else {
    preview = <div className={cls} style={{ backgroundColor: color }}>{label}</div>;
  }

  return (
    <button type="button" onClick={onClick}
      className={cn(
        "p-2 rounded-xl border-2 transition-colors overflow-hidden",
        selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
      )}>
      {preview}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────

export function StoreEditor({ business, storeSettings, plan = "free" }: { business: Business; storeSettings: StoreSettings | null; plan?: string }) {
  const isFreePlan = plan === "free" || plan === "trial";
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(business.is_published);
  const [publishLoading, setPublishLoading] = useState(false);
  const [mobileView, setMobileView] = useState<"editor" | "preview">("editor");
  const [previewKey, setPreviewKey] = useState(0);

  const previewUrl = `/${business.slug}`;
  // Show the connected custom domain when present; otherwise the edinio.com URL.
  const publicUrl = business.custom_domain
    ? `https://${business.custom_domain}`
    : `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/${business.slug}`;

  // Upload helper
  async function uploadFile(file: File, bucket: string): Promise<string | null> {
    const { uploadImage } = await import("@/lib/upload");
    const result = await uploadImage(file, bucket);
    if ("error" in result) return null;
    return result.url;
  }

  async function save(section: string, data: Parameters<typeof updateBusiness>[1]) {
    setSaving(section);
    const result = await updateBusiness(business.id, data);
    setSaving(null);
    if (result.error) { toast.error(result.error); }
    else { setSaved(section); setPreviewKey(k => k + 1); setTimeout(() => setSaved(null), 2000); }
  }

  // ── General section state
  const [general, setGeneral] = useState({
    store_name: business.store_name ?? business.business_name,
    tagline: business.tagline ?? "",
    description: business.description ?? "",
    phone: business.phone ?? "",
    whatsapp: business.whatsapp ?? "",
    email: business.email ?? "",
  });
  // WhatsApp = same number as phone unless an explicitly different one is set.
  const [whatsappSameAsPhone, setWhatsappSameAsPhone] = useState(
    () => !business.whatsapp || business.whatsapp === business.phone,
  );

  // ── Features state
  const rawFeatures = (business.features as Features) ?? {};
  const [features, setFeatures] = useState<Features>({
    floating_whatsapp: rawFeatures.floating_whatsapp !== false,
    floating_call: rawFeatures.floating_call ?? false,
  });

  // ── Branding section state
  const [logoPreview, setLogoPreview] = useState<string | null>(business.logo_url);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(((storeSettings?.page_content as PageContent | undefined)?.favicon_url) ?? null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const initialBanners: BannerItem[] = (() => {
    const pc = storeSettings?.page_content as PageContent | undefined;
    const raw = pc?.hero_banners;
    const linksRaw = pc?.hero_banner_links;
    const urls = Array.isArray(raw) ? raw.filter((u): u is string => typeof u === "string" && !!u) : [];
    const list = (urls.length ? urls : business.cover_url ? [business.cover_url] : []).slice(0, 5);
    return list.map((url, i) => ({ id: `init-${i}`, url, file: null, link: Array.isArray(linksRaw) ? (linksRaw[i] ?? "") : "" }));
  })();
  const [bannerItems, setBannerItems] = useState<BannerItem[]>(initialBanners);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  // Tracks which review row is uploading a photo (drives the per-row spinner).
  const [reviewUploadIdx, setReviewUploadIdx] = useState<number | null>(null);

  function addBannerFile(file: File) {
    setBannerItems((prev) =>
      prev.length >= 5 ? prev : [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, url: URL.createObjectURL(file), file }],
    );
  }
  function removeBanner(id: string) {
    setBannerItems((prev) => prev.filter((b) => b.id !== id));
  }
  function moveBanner(id: string, dir: -1 | 1) {
    setBannerItems((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  const [primaryColor, setPrimaryColor] = useState(business.primary_color);
  const [customHex, setCustomHex] = useState(business.primary_color);

  async function saveBranding() {
    setSaving("branding");
    let logo_url = business.logo_url;
    if (logoFile) logo_url = (await uploadFile(logoFile, "logos")) ?? logo_url;
    if (logoPreview === null) logo_url = null;

    let favicon_url: string | null;
    if (faviconFile) favicon_url = (await uploadFile(faviconFile, "logos")) ?? null;
    else favicon_url = faviconPreview;

    // Resolve banners in order: upload new files, keep already-hosted URLs.
    const bannerUrls: string[] = [];
    const bannerLinks: string[] = [];
    for (const b of bannerItems) {
      let url: string | null = null;
      if (b.file) { const u = await uploadFile(b.file, "covers"); if (u) url = u; }
      else if (b.url) url = b.url;
      if (url) { bannerUrls.push(url); bannerLinks.push((b.link ?? "").trim()); }
    }
    const cover_url = bannerUrls[0] ?? null;

    const result = await updateBusiness(business.id, { logo_url, cover_url, primary_color: primaryColor });
    // Banners (+ their click links) + hero overlay toggle live in page_content.
    const pcResult = await updatePageContent(business.id, { ...pageContent, hero_banners: bannerUrls, hero_banner_links: bannerLinks, favicon_url } as Record<string, unknown>);
    setSaving(null);
    if (result.error) { toast.error(result.error); }
    else if ("error" in pcResult) { toast.error(pcResult.error); }
    else {
      setSaved("branding");
      setLogoFile(null);
      setFaviconFile(null);
      setFaviconPreview(favicon_url);
      setBannerItems(bannerUrls.map((url, i) => ({ id: `saved-${i}`, url, file: null, link: bannerLinks[i] ?? "" })));
      setPreviewKey(k => k + 1);
      setTimeout(() => setSaved(null), 2000);
    }
  }

  // ── Location section state
  const [location, setLocation] = useState({
    address: business.store_address ?? "",
    city: business.store_city ?? "",
    county: business.store_county ?? "",
  });

  // ── Social section state
  const rawSocial = (business.social as Social) ?? {};
  const [social, setSocial] = useState<Social>({
    facebook: rawSocial.facebook ?? "",
    instagram: rawSocial.instagram ?? "",
    tiktok: rawSocial.tiktok ?? "",
    youtube: rawSocial.youtube ?? "",
  });

  // ── Page content state
  const rawPageContent = (storeSettings?.page_content as PageContent) ?? {};
  const [pageContent, setPageContent] = useState<PageContent>({
    announcement_bar: rawPageContent.announcement_bar ?? { enabled: false, text: "PLATA LA LIVRARE   ✦   LIVRARE RAPIDA 24-48H IN TOATA ROMANIA   ✦   RETUR 14 ZILE", bg_color: business.primary_color },
    trust_badges_enabled: rawPageContent.trust_badges_enabled ?? true,
    trust_badges: rawPageContent.trust_badges ?? [
      { icon: "truck", title: "Livrare 24-48h", desc: "Livrare rapida in toata Romania." },
      { icon: "shield", title: "Plata la livrare", desc: "Platesti cash curierului. Zero riscuri." },
      { icon: "rotate-ccw", title: "Retur 14 zile", desc: "Returneaza fara intrebari in 14 zile." },
      { icon: "phone", title: "Suport", desc: "Disponibil pentru orice intrebare." },
    ],
    show_trust_strip_on_store: rawPageContent.show_trust_strip_on_store ?? false,
    store_trust_badges: rawPageContent.store_trust_badges ?? [
      { icon: "truck", title: "Livrare 24-48h", desc: "Livrare rapida in toata Romania." },
      { icon: "shield", title: "Plata la livrare", desc: "Platesti cash curierului. Zero riscuri." },
      { icon: "rotate-ccw", title: "Retur 14 zile", desc: "Returneaza fara intrebari in 14 zile." },
      { icon: "phone", title: "Suport", desc: "Disponibil pentru orice intrebare." },
    ],
    show_featured_section: rawPageContent.show_featured_section ?? false,
    featured_section_title: rawPageContent.featured_section_title ?? "Recomandate",
    show_shipping_progress: rawPageContent.show_shipping_progress ?? false,
    store_benefits_section: rawPageContent.store_benefits_section ?? { enabled: false, title: "De ce sa alegi produsele noastre", items: [] },
    benefits_section: rawPageContent.benefits_section ?? { enabled: false, title: "De ce sa alegi acest produs", items: [] },
    how_it_works_section: rawPageContent.how_it_works_section ?? { enabled: false, title: "Cum functioneaza", steps: [] },
    faq_section: rawPageContent.faq_section ?? { enabled: false, title: "Intrebari frecvente", items: [] },
    button_effect: rawPageContent.button_effect ?? "none",
    reviews_section: rawPageContent.reviews_section ?? { enabled: false, title: "Ce spun clientii nostri", items: [] },
    checkout_config: rawPageContent.checkout_config ?? { custom_fields: [], extras: [] },
    show_announcement_on_store: rawPageContent.show_announcement_on_store ?? true,
    sort_options: rawPageContent.sort_options ?? { enabled: true, default_sort: "newest" },
    sticky_cart_bar: rawPageContent.sticky_cart_bar ?? { enabled: true },
    new_badge: rawPageContent.new_badge ?? { enabled: true, days: 7 },
    image_zoom: rawPageContent.image_zoom ?? { enabled: true },
    delivery_estimate: rawPageContent.delivery_estimate ?? { enabled: false, min_days: 2, max_days: 4, text: "Estimare livrare" },
    show_social_proof: rawPageContent.show_social_proof ?? false,
    show_quality_badge: rawPageContent.show_quality_badge ?? true,
    show_category_badges: rawPageContent.show_category_badges ?? true,
    hide_edinio_badge: rawPageContent.hide_edinio_badge ?? false,
    store_bg_color: rawPageContent.store_bg_color ?? "#FFFFFF",
    logo_size: rawPageContent.logo_size ?? 36,
    footer_logo_size: rawPageContent.footer_logo_size ?? 36,
    favicon_url: rawPageContent.favicon_url ?? null,
    hero_show_content: rawPageContent.hero_show_content ?? false,
  });

  async function savePageContent() {
    setSaving("page");
    const result = await updatePageContent(business.id, pageContent as Record<string, unknown>);
    setSaving(null);
    if ("error" in result) toast.error(result.error);
    else { setSaved("page"); setPreviewKey(k => k + 1); setTimeout(() => setSaved(null), 2000); }
  }

  async function saveCheckoutConfig() {
    setSaving("checkout");
    const result = await updatePageContent(business.id, pageContent as Record<string, unknown>);
    setSaving(null);
    if ("error" in result) toast.error(result.error);
    else { setSaved("checkout"); setPreviewKey(k => k + 1); setTimeout(() => setSaved(null), 2000); }
  }

  // ── Publish toggle
  async function togglePublish() {
    setPublishLoading(true);
    const result = await updateBusiness(business.id, { is_published: !isPublished });
    if (result.error) { toast.error(result.error); }
    else {
      setIsPublished(!isPublished);
      toast.success(isPublished ? "Magazinul a fost ascuns." : "Magazinul este acum publicat.");
    }
    setPublishLoading(false);
  }

  // ── Sections
  const sections = [
    {
      id: "general",
      icon: Info,
      title: "Informatii generale",
      content: (
        <div className="px-5 pb-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Numele magazinului</label>
            <input type="text" value={general.store_name} className={inputCls}
              onChange={(e) => setGeneral((p) => ({ ...p, store_name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Slogan</label>
            <input type="text" value={general.tagline} className={inputCls} maxLength={120}
              onChange={(e) => setGeneral((p) => ({ ...p, tagline: e.target.value }))}
              placeholder="ex: Livrare rapida in toata tara" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Descriere</label>
            <textarea value={general.description} rows={4} className={inputCls + " resize-none"} maxLength={600}
              onChange={(e) => setGeneral((p) => ({ ...p, description: e.target.value }))}
              placeholder="Descrie pe scurt ce vinzi si ce te face special..." />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Telefon</label>
            <input type="tel" value={general.phone} className={inputCls}
              onChange={(e) => setGeneral((p) => ({ ...p, phone: e.target.value }))} />
            <label className="mt-2 flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={whatsappSameAsPhone}
                onChange={(e) => setWhatsappSameAsPhone(e.target.checked)}
                className="h-4 w-4 accent-primary cursor-pointer flex-shrink-0" />
              <span className="text-xs text-foreground">Numarul este disponibil si pe WhatsApp</span>
            </label>
          </div>
          {!whatsappSameAsPhone && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Numar WhatsApp (diferit)</label>
              <input type="tel" value={general.whatsapp} className={inputCls}
                onChange={(e) => setGeneral((p) => ({ ...p, whatsapp: e.target.value }))}
                placeholder="ex: 07xx xxx xxx" />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
            <input type="email" value={general.email} className={inputCls}
              onChange={(e) => setGeneral((p) => ({ ...p, email: e.target.value }))} />
          </div>
          <div className="border border-border rounded-xl p-3 space-y-3">
            <p className="text-xs font-semibold text-foreground">Butoane flotante</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-foreground">Buton WhatsApp</p>
                <p className="text-[10px] text-muted-foreground">Necesita numar WhatsApp completat</p>
              </div>
              <button type="button"
                onClick={() => setFeatures(f => ({ ...f, floating_whatsapp: !f.floating_whatsapp }))}
                className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", features.floating_whatsapp ? "bg-primary" : "bg-muted-foreground/30")}>
                <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", features.floating_whatsapp ? "translate-x-4" : "translate-x-0")} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-foreground">Buton Apel</p>
                <p className="text-[10px] text-muted-foreground">Necesita numar de telefon completat</p>
              </div>
              <button type="button"
                onClick={() => setFeatures(f => ({ ...f, floating_call: !f.floating_call }))}
                className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", features.floating_call ? "bg-primary" : "bg-muted-foreground/30")}>
                <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", features.floating_call ? "translate-x-4" : "translate-x-0")} />
              </button>
            </div>
          </div>
          <SaveBtn loading={saving === "general"} saved={saved === "general"}
            onSave={() => save("general", {
              store_name: general.store_name || null,
              tagline: general.tagline || null,
              description: general.description || null,
              phone: general.phone || null,
              whatsapp: (whatsappSameAsPhone ? general.phone : general.whatsapp) || null,
              email: general.email || null,
              features: { ...rawFeatures, ...features } as Record<string, boolean>,
            })} />
        </div>
      ),
    },
    {
      id: "branding",
      icon: Palette,
      title: "Identitate vizuala",
      content: (
        <div className="px-5 pb-5 space-y-4">
          <div className="max-w-[180px]">
            <ImageUploadField label="Logo" aspectRatio="1/1" preview={logoPreview}
              onFile={(f) => { setLogoFile(f); setLogoPreview(URL.createObjectURL(f)); }}
              onRemove={() => { setLogoFile(null); setLogoPreview(null); }} />
          </div>
          <div className="max-w-[180px]">
            <ImageUploadField label="Favicon (iconita din tab)" aspectRatio="1/1" preview={faviconPreview}
              onFile={(f) => { setFaviconFile(f); setFaviconPreview(URL.createObjectURL(f)); }}
              onRemove={() => { setFaviconFile(null); setFaviconPreview(null); }} />
            <p className="text-[10px] text-muted-foreground mt-1.5">Imagine patrata (ideal 512x512px, PNG). Daca lipseste, se foloseste logo-ul.</p>
          </div>
          {logoPreview && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-muted-foreground">Marime logo</label>
                <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">{pageContent.logo_size ?? 36}px</span>
              </div>
              <input type="range" min={24} max={56} step={1}
                value={pageContent.logo_size ?? 36}
                onChange={(e) => setPageContent(p => ({ ...p, logo_size: Number(e.target.value) }))}
                className="w-full accent-primary cursor-pointer" />
              {/* Live preview of the store header logo at the chosen size. */}
              <div className="mt-2 flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 h-16 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoPreview} alt=""
                  style={{ height: pageContent.logo_size ?? 36, maxWidth: (pageContent.logo_size ?? 36) * 4.2 }}
                  className="w-auto object-contain flex-shrink-0" />
                <span className="text-sm font-semibold text-foreground truncate">{business.store_name ?? business.business_name}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">Cum se vede logo-ul in antetul magazinului. Trage cursorul ca sa-l faci mai mare sau mai mic.</p>
            </div>
          )}
          {logoPreview && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-muted-foreground">Marime logo footer</label>
                <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">{pageContent.footer_logo_size ?? 36}px</span>
              </div>
              <input type="range" min={24} max={56} step={1}
                value={pageContent.footer_logo_size ?? 36}
                onChange={(e) => setPageContent(p => ({ ...p, footer_logo_size: Number(e.target.value) }))}
                className="w-full accent-primary cursor-pointer" />
              {/* Live preview of the footer logo on the dark footer background. */}
              <div className="mt-2 flex items-center gap-2.5 rounded-lg border border-border bg-[#0A0A0A] px-3 h-16 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoPreview} alt=""
                  style={{ height: pageContent.footer_logo_size ?? 36, maxWidth: (pageContent.footer_logo_size ?? 36) * 4.2 }}
                  className="w-auto object-contain flex-shrink-0" />
                <span className="text-sm font-semibold text-white truncate">{business.store_name ?? business.business_name}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">Cum se vede logo-ul in footer-ul magazinului.</p>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Bannere magazin (max 5)</label>
            <div className="space-y-2">
              {bannerItems.map((b, i) => (
                <div key={b.id} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 h-24 rounded-lg overflow-hidden border border-border bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={b.url} alt="" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <button type="button" aria-label="Muta sus" disabled={i === 0} onClick={() => moveBanner(b.id, -1)}
                        className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30">
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label="Muta jos" disabled={i === bannerItems.length - 1} onClick={() => moveBanner(b.id, 1)}
                        className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label="Sterge banner" onClick={() => removeBanner(b.id)}
                        className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-red-500 hover:bg-red-50">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={b.link ?? ""}
                    onChange={(e) => setBannerItems((prev) => prev.map((x) => x.id === b.id ? { ...x, link: e.target.value } : x))}
                    placeholder="Link la apasare (optional): /produse, /contact sau https://..."
                    className="w-full px-2.5 py-1.5 text-xs border border-border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                  />
                </div>
              ))}
              {bannerItems.length < 5 && (
                <button type="button" onClick={() => bannerInputRef.current?.click()}
                  className="w-full h-20 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:bg-primary/5 transition-colors">
                  <Upload className="h-4 w-4" />
                  <span className="text-xs">Adauga banner ({bannerItems.length}/5)</span>
                </button>
              )}
              <input ref={bannerInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) addBannerFile(f); e.target.value = ""; }} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">Recomandat 16:9 (ex. 1920x1080). Cu mai multe bannere, se afiseaza ca un carusel pe magazin.</p>
          </div>
          {bannerItems.length > 0 && (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <label className="text-xs font-semibold text-foreground">Afiseaza continutul peste banner</label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Implicit, cand ai un banner se afiseaza doar imaginea (completa, fara taiere). Activeaza ca sa suprapui logo-ul, numele, descrierea si butonul peste banner.
                </p>
              </div>
              <button type="button"
                onClick={() => setPageContent(p => ({ ...p, hero_show_content: !p.hero_show_content }))}
                className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0 mt-0.5", pageContent.hero_show_content ? "bg-primary" : "bg-muted-foreground/30")}>
                <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", pageContent.hero_show_content ? "translate-x-4" : "translate-x-0")} />
              </button>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Culoare principala</label>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {COLOR_PRESETS.map((c) => (
                <button key={c} type="button" onClick={() => { setPrimaryColor(c); setCustomHex(c); }}
                  className="w-7 h-7 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: primaryColor === c ? "white" : c,
                    boxShadow: primaryColor === c ? `0 0 0 2px ${c}` : "none",
                    transform: primaryColor === c ? "scale(1.15)" : "scale(1)",
                  }} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input type="color" value={customHex}
                onChange={(e) => { setCustomHex(e.target.value); setPrimaryColor(e.target.value); }}
                className="w-8 h-8 rounded border border-border cursor-pointer" />
              <input type="text" value={customHex} maxLength={7} placeholder="#1AB554"
                onChange={(e) => { setCustomHex(e.target.value); if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) setPrimaryColor(e.target.value); }}
                className="w-28 px-2 py-1.5 text-xs border border-border rounded-lg bg-surface font-mono focus:outline-none focus:border-primary" />
            </div>
          </div>
          <SaveBtn loading={saving === "branding"} saved={saved === "branding"} onSave={saveBranding} />
        </div>
      ),
    },
    {
      id: "location",
      icon: MapPin,
      title: "Locatie",
      content: (
        <div className="px-5 pb-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Adresa</label>
            <input type="text" value={location.address} className={inputCls}
              onChange={(e) => setLocation((p) => ({ ...p, address: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Oras</label>
              <input type="text" value={location.city} className={inputCls}
                onChange={(e) => setLocation((p) => ({ ...p, city: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Judet</label>
              <input type="text" value={location.county} className={inputCls}
                onChange={(e) => setLocation((p) => ({ ...p, county: e.target.value }))} />
            </div>
          </div>
          <SaveBtn loading={saving === "location"} saved={saved === "location"}
            onSave={() => save("location", {
              store_address: location.address || null,
              store_city: location.city || null,
              store_county: location.county || null,
            })} />
        </div>
      ),
    },
    {
      id: "social",
      icon: Share2,
      title: "Social media",
      content: (
        <div className="px-5 pb-5 space-y-3">
          {(["instagram", "facebook", "tiktok", "youtube"] as const).map((key) => (
            <div key={key}>
              <label className="block text-xs font-medium text-muted-foreground mb-1 capitalize">{key}</label>
              <input type="url" value={social[key] ?? ""} className={inputCls}
                placeholder={`https://${key}.com/...`}
                onChange={(e) => setSocial((p) => ({ ...p, [key]: e.target.value }))} />
            </div>
          ))}
          <SaveBtn loading={saving === "social"} saved={saved === "social"}
            onSave={() => save("social", { social: social as Record<string, string> })} />
        </div>
      ),
    },
    {
      id: "page",
      icon: Layout,
      title: "Pagina produs",
      content: (
        <div className="px-5 pb-5 space-y-5">
          {/* Announcement bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">Banner anunt (top)</label>
              <button type="button"
                onClick={() => setPageContent(p => ({ ...p, announcement_bar: { ...p.announcement_bar!, enabled: !p.announcement_bar?.enabled } }))}
                className={cn("relative w-9 h-5 rounded-full transition-colors", pageContent.announcement_bar?.enabled ? "bg-primary" : "bg-muted-foreground/30")}>
                <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", pageContent.announcement_bar?.enabled ? "translate-x-4" : "translate-x-0")} />
              </button>
            </div>
            {pageContent.announcement_bar?.enabled && (
              <div className="space-y-2">
                <input type="text" value={pageContent.announcement_bar.text} className={inputCls}
                  placeholder="PLATA LA LIVRARE   ✦   LIVRARE RAPIDA 24-48H"
                  onChange={e => setPageContent(p => ({ ...p, announcement_bar: { ...p.announcement_bar!, text: e.target.value } }))} />
                <div className="flex items-center gap-2">
                  <input type="color" value={pageContent.announcement_bar.bg_color}
                    onChange={e => setPageContent(p => ({ ...p, announcement_bar: { ...p.announcement_bar!, bg_color: e.target.value } }))}
                    className="w-8 h-8 rounded border border-border cursor-pointer" />
                  <span className="text-xs text-muted-foreground">Culoare fundal banner</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Viteza de redare</span>
                    <span className="text-xs font-medium text-foreground">
                      {["Foarte lent", "Lent", "Normal", "Rapid", "Foarte rapid"][((pageContent.announcement_bar.speed ?? 3) - 1)]}
                    </span>
                  </div>
                  <input type="range" min={1} max={5} step={1}
                    value={pageContent.announcement_bar.speed ?? 3}
                    onChange={e => setPageContent(p => ({ ...p, announcement_bar: { ...p.announcement_bar!, speed: Number(e.target.value) } }))}
                    className="w-full h-1.5 accent-primary cursor-pointer" />
                </div>
              </div>
            )}
          </div>

          <hr className="border-border" />

          {/* Store background color */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground">Culoare fundal magazin</label>
            <div className="flex items-center gap-2 flex-wrap">
              {["#FFFFFF", "#FAFAFA", "#F5F5F4", "#F0FDF4", "#FDF2F8", "#FFF7ED", "#F0F9FF", "#FAF5FF"].map(c => (
                <button key={c} type="button"
                  onClick={() => setPageContent(p => ({ ...p, store_bg_color: c }))}
                  className="w-7 h-7 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: (pageContent.store_bg_color ?? "#FFFFFF") === c ? "var(--color-primary)" : "#e5e7eb",
                    boxShadow: (pageContent.store_bg_color ?? "#FFFFFF") === c ? "0 0 0 2px var(--color-primary)" : "none",
                    transform: (pageContent.store_bg_color ?? "#FFFFFF") === c ? "scale(1.15)" : "scale(1)",
                  }} />
              ))}
              <input type="color" value={pageContent.store_bg_color ?? "#FFFFFF"}
                onChange={e => setPageContent(p => ({ ...p, store_bg_color: e.target.value }))}
                className="w-8 h-8 rounded border border-border cursor-pointer" />
            </div>
            <p className="text-[11px] text-muted-foreground">Culoarea de fundal a intregului magazin</p>
          </div>

          <hr className="border-border" />

          {/* Trust badges */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-foreground">Garantii (4 carduri)</label>
              <button type="button"
                onClick={() => setPageContent(p => ({ ...p, trust_badges_enabled: !p.trust_badges_enabled }))}
                className={cn("relative w-9 h-5 rounded-full transition-colors", pageContent.trust_badges_enabled ? "bg-primary" : "bg-muted-foreground/30")}>
                <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", pageContent.trust_badges_enabled ? "translate-x-4" : "translate-x-0")} />
              </button>
            </div>
            {pageContent.trust_badges_enabled && <div className="space-y-2">
              {(pageContent.trust_badges ?? []).map((badge, i) => (
                <div key={i} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Titlu</label>
                      <input type="text" value={badge.title} className={inputCls + " !py-1.5 !text-xs"}
                        onChange={e => setPageContent(p => ({ ...p, trust_badges: p.trust_badges!.map((b, j) => j === i ? { ...b, title: e.target.value } : b) }))} />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Icon</label>
                      <select value={badge.icon} className={inputCls + " !py-1.5 !text-xs"}
                        onChange={e => setPageContent(p => ({ ...p, trust_badges: p.trust_badges!.map((b, j) => j === i ? { ...b, icon: e.target.value } : b) }))}>
                        <option value="truck">Livrare</option>
                        <option value="shield">Protectie</option>
                        <option value="rotate-ccw">Retur</option>
                        <option value="phone">Telefon</option>
                      </select>
                    </div>
                  </div>
                  <input type="text" value={badge.desc} className={inputCls + " !py-1.5 !text-xs"}
                    placeholder="Descriere scurta..."
                    onChange={e => setPageContent(p => ({ ...p, trust_badges: p.trust_badges!.map((b, j) => j === i ? { ...b, desc: e.target.value } : b) }))} />
                </div>
              ))}
            </div>}
          </div>

          <hr className="border-border" />

          {/* Benefits section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">Sectiunea Beneficii</label>
              <button type="button"
                onClick={() => setPageContent(p => ({ ...p, benefits_section: { ...p.benefits_section!, enabled: !p.benefits_section?.enabled } }))}
                className={cn("relative w-9 h-5 rounded-full transition-colors", pageContent.benefits_section?.enabled ? "bg-primary" : "bg-muted-foreground/30")}>
                <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", pageContent.benefits_section?.enabled ? "translate-x-4" : "translate-x-0")} />
              </button>
            </div>
            {pageContent.benefits_section?.enabled && (
              <div className="space-y-2">
                <input type="text" value={pageContent.benefits_section.title} className={inputCls}
                  placeholder="Titlu sectiune" onChange={e => setPageContent(p => ({ ...p, benefits_section: { ...p.benefits_section!, title: e.target.value } }))} />
                {pageContent.benefits_section.items.map((item, i) => (
                  <div key={i} className="border border-border rounded-lg p-2 space-y-1.5">
                    <div className="flex gap-1">
                      <input type="text" value={item.title} className={inputCls + " !py-1.5 !text-xs"} placeholder="Titlu"
                        onChange={e => setPageContent(p => ({ ...p, benefits_section: { ...p.benefits_section!, items: p.benefits_section!.items.map((it, j) => j === i ? { ...it, title: e.target.value } : it) } }))} />
                      <button type="button" onClick={() => setPageContent(p => ({ ...p, benefits_section: { ...p.benefits_section!, items: p.benefits_section!.items.filter((_, j) => j !== i) } }))}
                        className="p-1.5 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                    </div>
                    <input type="text" value={item.desc} className={inputCls + " !py-1.5 !text-xs"} placeholder="Descriere"
                      onChange={e => setPageContent(p => ({ ...p, benefits_section: { ...p.benefits_section!, items: p.benefits_section!.items.map((it, j) => j === i ? { ...it, desc: e.target.value } : it) } }))} />
                  </div>
                ))}
                <button type="button" onClick={() => setPageContent(p => ({ ...p, benefits_section: { ...p.benefits_section!, items: [...p.benefits_section!.items, { title: "", desc: "" }] } }))}
                  className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <Plus className="h-3 w-3" /> Adauga beneficiu
                </button>
              </div>
            )}
          </div>

          <hr className="border-border" />

          {/* How it works */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">Sectiunea Cum functioneaza</label>
              <button type="button"
                onClick={() => setPageContent(p => ({ ...p, how_it_works_section: { ...p.how_it_works_section!, enabled: !p.how_it_works_section?.enabled } }))}
                className={cn("relative w-9 h-5 rounded-full transition-colors", pageContent.how_it_works_section?.enabled ? "bg-primary" : "bg-muted-foreground/30")}>
                <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", pageContent.how_it_works_section?.enabled ? "translate-x-4" : "translate-x-0")} />
              </button>
            </div>
            {pageContent.how_it_works_section?.enabled && (
              <div className="space-y-2">
                <input type="text" value={pageContent.how_it_works_section.title} className={inputCls}
                  placeholder="Titlu sectiune" onChange={e => setPageContent(p => ({ ...p, how_it_works_section: { ...p.how_it_works_section!, title: e.target.value } }))} />
                {pageContent.how_it_works_section.steps.map((step, i) => (
                  <div key={i} className="border border-border rounded-lg p-2 space-y-1.5">
                    <div className="flex gap-1">
                      <span className="text-[10px] font-bold text-muted-foreground self-center px-1">{String(i + 1).padStart(2, "0")}</span>
                      <input type="text" value={step.title} className={inputCls + " !py-1.5 !text-xs"} placeholder="Titlu pas"
                        onChange={e => setPageContent(p => ({ ...p, how_it_works_section: { ...p.how_it_works_section!, steps: p.how_it_works_section!.steps.map((s, j) => j === i ? { ...s, title: e.target.value } : s) } }))} />
                      <button type="button" onClick={() => setPageContent(p => ({ ...p, how_it_works_section: { ...p.how_it_works_section!, steps: p.how_it_works_section!.steps.filter((_, j) => j !== i) } }))}
                        className="p-1.5 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                    </div>
                    <input type="text" value={step.desc} className={inputCls + " !py-1.5 !text-xs"} placeholder="Descriere pas"
                      onChange={e => setPageContent(p => ({ ...p, how_it_works_section: { ...p.how_it_works_section!, steps: p.how_it_works_section!.steps.map((s, j) => j === i ? { ...s, desc: e.target.value } : s) } }))} />
                  </div>
                ))}
                {pageContent.how_it_works_section.steps.length < 5 && (
                  <button type="button" onClick={() => setPageContent(p => ({ ...p, how_it_works_section: { ...p.how_it_works_section!, steps: [...p.how_it_works_section!.steps, { title: "", desc: "" }] } }))}
                    className="flex items-center gap-1 text-xs text-primary hover:underline">
                    <Plus className="h-3 w-3" /> Adauga pas
                  </button>
                )}
              </div>
            )}
          </div>

          <hr className="border-border" />

          {/* FAQ */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">Sectiunea FAQ</label>
              <button type="button"
                onClick={() => setPageContent(p => ({ ...p, faq_section: { ...p.faq_section!, enabled: !p.faq_section?.enabled } }))}
                className={cn("relative w-9 h-5 rounded-full transition-colors", pageContent.faq_section?.enabled ? "bg-primary" : "bg-muted-foreground/30")}>
                <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", pageContent.faq_section?.enabled ? "translate-x-4" : "translate-x-0")} />
              </button>
            </div>
            {pageContent.faq_section?.enabled && (
              <div className="space-y-2">
                <input type="text" value={pageContent.faq_section.title} className={inputCls}
                  placeholder="Titlu sectiune" onChange={e => setPageContent(p => ({ ...p, faq_section: { ...p.faq_section!, title: e.target.value } }))} />
                {pageContent.faq_section.items.map((item, i) => (
                  <div key={i} className="border border-border rounded-lg p-2 space-y-1.5">
                    <div className="flex gap-1">
                      <input type="text" value={item.q} className={inputCls + " !py-1.5 !text-xs"} placeholder="Intrebare"
                        onChange={e => setPageContent(p => ({ ...p, faq_section: { ...p.faq_section!, items: p.faq_section!.items.map((it, j) => j === i ? { ...it, q: e.target.value } : it) } }))} />
                      <button type="button" onClick={() => setPageContent(p => ({ ...p, faq_section: { ...p.faq_section!, items: p.faq_section!.items.filter((_, j) => j !== i) } }))}
                        className="p-1.5 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                    </div>
                    <textarea value={item.a} rows={2} className={inputCls + " !py-1.5 !text-xs resize-none"} placeholder="Raspuns"
                      onChange={e => setPageContent(p => ({ ...p, faq_section: { ...p.faq_section!, items: p.faq_section!.items.map((it, j) => j === i ? { ...it, a: e.target.value } : it) } }))} />
                  </div>
                ))}
                <button type="button" onClick={() => setPageContent(p => ({ ...p, faq_section: { ...p.faq_section!, items: [...p.faq_section!.items, { q: "", a: "" }] } }))}
                  className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <Plus className="h-3 w-3" /> Adauga intrebare
                </button>
              </div>
            )}
          </div>

          <hr className="border-border" />

          {/* Image zoom */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-semibold text-foreground">Zoom imagine la hover</label>
              <p className="text-[10px] text-muted-foreground mt-0.5">Mareste imaginea produsului cand treci cu mouse-ul pe desktop</p>
            </div>
            <button type="button"
              onClick={() => setPageContent(p => ({ ...p, image_zoom: { enabled: !p.image_zoom?.enabled } }))}
              className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", pageContent.image_zoom?.enabled ? "bg-primary" : "bg-muted-foreground/30")}>
              <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", pageContent.image_zoom?.enabled ? "translate-x-4" : "translate-x-0")} />
            </button>
          </div>

          <hr className="border-border" />

          {/* Delivery estimate */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold text-foreground">Estimare livrare</label>
                <p className="text-[10px] text-muted-foreground mt-0.5">Afiseaza o estimare a datei de livrare pe pagina produsului</p>
              </div>
              <button type="button"
                onClick={() => setPageContent(p => ({ ...p, delivery_estimate: { ...p.delivery_estimate!, enabled: !p.delivery_estimate?.enabled } }))}
                className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", pageContent.delivery_estimate?.enabled ? "bg-primary" : "bg-muted-foreground/30")}>
                <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", pageContent.delivery_estimate?.enabled ? "translate-x-4" : "translate-x-0")} />
              </button>
            </div>
            {pageContent.delivery_estimate?.enabled && (
              <div className="space-y-2">
                <input type="text" value={pageContent.delivery_estimate.text ?? "Estimare livrare"} className={inputCls + " !py-1.5 !text-xs"}
                  placeholder="Estimare livrare"
                  onChange={e => setPageContent(p => ({ ...p, delivery_estimate: { ...p.delivery_estimate!, text: e.target.value } }))} />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Zile minim</label>
                    <input type="number" min={1} max={30} value={pageContent.delivery_estimate.min_days ?? 2} className={inputCls + " !py-1.5 !text-xs"}
                      onChange={e => setPageContent(p => ({ ...p, delivery_estimate: { ...p.delivery_estimate!, min_days: parseInt(e.target.value) || 2 } }))} />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Zile maxim</label>
                    <input type="number" min={1} max={30} value={pageContent.delivery_estimate.max_days ?? 4} className={inputCls + " !py-1.5 !text-xs"}
                      onChange={e => setPageContent(p => ({ ...p, delivery_estimate: { ...p.delivery_estimate!, max_days: parseInt(e.target.value) || 4 } }))} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <hr className="border-border" />

          {/* Social proof counter */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-semibold text-foreground">Contor vizitatori live</label>
              <p className="text-[10px] text-muted-foreground mt-0.5">Numarul de persoane care se uita acum, pe pagina produsului. Oprit implicit.</p>
            </div>
            <button type="button"
              onClick={() => setPageContent(p => ({ ...p, show_social_proof: !p.show_social_proof }))}
              className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", pageContent.show_social_proof ? "bg-primary" : "bg-muted-foreground/30")}>
              <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", pageContent.show_social_proof ? "translate-x-4" : "translate-x-0")} />
            </button>
          </div>

          <hr className="border-border" />

          {/* Quality badge */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-semibold text-foreground">Badge Calitate verificata</label>
              <p className="text-[10px] text-muted-foreground mt-0.5">Eticheta cu stele de pe pagina produsului.</p>
            </div>
            <button type="button"
              onClick={() => setPageContent(p => ({ ...p, show_quality_badge: !(p.show_quality_badge !== false) }))}
              className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", pageContent.show_quality_badge !== false ? "bg-primary" : "bg-muted-foreground/30")}>
              <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", pageContent.show_quality_badge !== false ? "translate-x-4" : "translate-x-0")} />
            </button>
          </div>

          <hr className="border-border" />

          {/* Efect buton comanda */}
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">Efect buton "Comanda acum"</label>
            <p className="text-[11px] text-muted-foreground mb-2">Animatie aplicata pe butonul principal de pe pagina produsului.</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "none", label: "Niciun efect" },
                { id: "pulse", label: "Pulse" },
                { id: "shake", label: "Shake" },
                { id: "bounce", label: "Bounce" },
                { id: "glow", label: "Glow" },
                { id: "heartbeat", label: "Heartbeat" },
              ].map(({ id, label }) => (
                <EffectPreview key={id} id={id} label={label} color={primaryColor}
                  selected={pageContent.button_effect === id}
                  onClick={() => setPageContent(p => ({ ...p, button_effect: id }))} />
              ))}
            </div>
          </div>

          <SaveBtn loading={saving === "page"} saved={saved === "page"} onSave={savePageContent} />
        </div>
      ),
    },
    {
      id: "store_page",
      icon: Home,
      title: "Pagina magazin",
      content: (
        <div className="px-5 pb-5 space-y-5">
          {/* Category badges on product cards */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-semibold text-foreground">Eticheta categorie pe produse</label>
              <p className="text-[10px] text-muted-foreground mt-0.5">Afiseaza categoria pe cardurile de produs din magazin.</p>
            </div>
            <button type="button"
              onClick={() => setPageContent(p => ({ ...p, show_category_badges: !(p.show_category_badges !== false) }))}
              className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", pageContent.show_category_badges !== false ? "bg-primary" : "bg-muted-foreground/30")}>
              <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", pageContent.show_category_badges !== false ? "translate-x-4" : "translate-x-0")} />
            </button>
          </div>

          <hr className="border-border" />

          {/* "Creat cu Edinio" footer credit — can be hidden on a paid plan */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-semibold text-foreground">Afiseaza creditul Edinio in footer</label>
              <p className="text-[10px] text-muted-foreground mt-0.5">{isFreePlan ? "Poate fi ascuns doar pe un plan platit." : "Cand e oprit, textul de credit dispare din footer-ul magazinului."}</p>
            </div>
            <button type="button" disabled={isFreePlan}
              onClick={() => { if (!isFreePlan) setPageContent(p => ({ ...p, hide_edinio_badge: !p.hide_edinio_badge })); }}
              className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed", !pageContent.hide_edinio_badge ? "bg-primary" : "bg-muted-foreground/30")}>
              <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", !pageContent.hide_edinio_badge ? "translate-x-4" : "translate-x-0")} />
            </button>
          </div>

          <hr className="border-border" />

          {/* Store benefits */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">Sectiunea Beneficii</label>
              <button type="button"
                onClick={() => setPageContent(p => ({ ...p, store_benefits_section: { ...p.store_benefits_section!, enabled: !p.store_benefits_section?.enabled } }))}
                className={cn("relative w-9 h-5 rounded-full transition-colors", pageContent.store_benefits_section?.enabled ? "bg-primary" : "bg-muted-foreground/30")}>
                <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", pageContent.store_benefits_section?.enabled ? "translate-x-4" : "translate-x-0")} />
              </button>
            </div>
            {pageContent.store_benefits_section?.enabled && (
              <div className="space-y-2">
                <input type="text" value={pageContent.store_benefits_section.title} className={inputCls}
                  placeholder="Titlu sectiune" onChange={e => setPageContent(p => ({ ...p, store_benefits_section: { ...p.store_benefits_section!, title: e.target.value } }))} />
                {pageContent.store_benefits_section.items.map((item, i) => (
                  <div key={i} className="border border-border rounded-lg p-2 space-y-1.5">
                    <div className="flex gap-1">
                      <input type="text" value={item.title} className={inputCls + " !py-1.5 !text-xs"} placeholder="Titlu"
                        onChange={e => setPageContent(p => ({ ...p, store_benefits_section: { ...p.store_benefits_section!, items: p.store_benefits_section!.items.map((it, j) => j === i ? { ...it, title: e.target.value } : it) } }))} />
                      <button type="button" onClick={() => setPageContent(p => ({ ...p, store_benefits_section: { ...p.store_benefits_section!, items: p.store_benefits_section!.items.filter((_, j) => j !== i) } }))}
                        className="p-1.5 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                    </div>
                    <input type="text" value={item.desc} className={inputCls + " !py-1.5 !text-xs"} placeholder="Descriere"
                      onChange={e => setPageContent(p => ({ ...p, store_benefits_section: { ...p.store_benefits_section!, items: p.store_benefits_section!.items.map((it, j) => j === i ? { ...it, desc: e.target.value } : it) } }))} />
                  </div>
                ))}
                <button type="button" onClick={() => setPageContent(p => ({ ...p, store_benefits_section: { ...p.store_benefits_section!, items: [...p.store_benefits_section!.items, { title: "", desc: "" }] } }))}
                  className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <Plus className="h-3 w-3" /> Adauga beneficiu
                </button>
              </div>
            )}
          </div>

          <hr className="border-border" />

          {/* Store trust badges */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">Garantii (4 carduri)</label>
              <button type="button"
                onClick={() => setPageContent(p => ({ ...p, show_trust_strip_on_store: !p.show_trust_strip_on_store }))}
                className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", pageContent.show_trust_strip_on_store ? "bg-primary" : "bg-muted-foreground/30")}>
                <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", pageContent.show_trust_strip_on_store ? "translate-x-4" : "translate-x-0")} />
              </button>
            </div>
            {pageContent.show_trust_strip_on_store && <div className="space-y-2">
              {(pageContent.store_trust_badges ?? []).map((badge, i) => (
                <div key={i} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Titlu</label>
                      <input type="text" value={badge.title} className={inputCls + " !py-1.5 !text-xs"}
                        onChange={e => setPageContent(p => ({ ...p, store_trust_badges: p.store_trust_badges!.map((b, j) => j === i ? { ...b, title: e.target.value } : b) }))} />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Icon</label>
                      <select value={badge.icon} className={inputCls + " !py-1.5 !text-xs"}
                        onChange={e => setPageContent(p => ({ ...p, store_trust_badges: p.store_trust_badges!.map((b, j) => j === i ? { ...b, icon: e.target.value } : b) }))}>
                        <option value="truck">Livrare</option>
                        <option value="shield">Protectie</option>
                        <option value="rotate-ccw">Retur</option>
                        <option value="phone">Telefon</option>
                      </select>
                    </div>
                  </div>
                  <input type="text" value={badge.desc} className={inputCls + " !py-1.5 !text-xs"}
                    placeholder="Descriere scurta..."
                    onChange={e => setPageContent(p => ({ ...p, store_trust_badges: p.store_trust_badges!.map((b, j) => j === i ? { ...b, desc: e.target.value } : b) }))} />
                </div>
              ))}
            </div>}
          </div>

          {/* Featured section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold text-foreground">Sectiunea produse recomandate</label>
                <p className="text-[10px] text-muted-foreground mt-0.5">Produsele marcate "Popular" apar separat</p>
              </div>
              <button type="button"
                onClick={() => setPageContent(p => ({ ...p, show_featured_section: !p.show_featured_section }))}
                className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", pageContent.show_featured_section ? "bg-primary" : "bg-muted-foreground/30")}>
                <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", pageContent.show_featured_section ? "translate-x-4" : "translate-x-0")} />
              </button>
            </div>
            {pageContent.show_featured_section && (
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Titlu sectiune</label>
                <input type="text" value={pageContent.featured_section_title ?? "Recomandate"} className={inputCls + " !py-1.5 !text-xs"}
                  placeholder="Recomandate"
                  onChange={e => setPageContent(p => ({ ...p, featured_section_title: e.target.value }))} />
              </div>
            )}
          </div>

          {/* Shipping progress */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-semibold text-foreground">Bara progres livrare gratuita</label>
              <p className="text-[10px] text-muted-foreground mt-0.5">Vizibila daca ai setat un prag de livrare gratuita</p>
            </div>
            <button type="button"
              onClick={() => setPageContent(p => ({ ...p, show_shipping_progress: !p.show_shipping_progress }))}
              className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", pageContent.show_shipping_progress ? "bg-primary" : "bg-muted-foreground/30")}>
              <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", pageContent.show_shipping_progress ? "translate-x-4" : "translate-x-0")} />
            </button>
          </div>

          <hr className="border-border" />

          {/* Reviews */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold text-foreground">Sectiunea Recenzii</label>
                <p className="text-[10px] text-muted-foreground mt-0.5">Recenzii adaugate manual de tine</p>
              </div>
              <button type="button"
                onClick={() => setPageContent(p => ({ ...p, reviews_section: { ...p.reviews_section!, enabled: !p.reviews_section?.enabled } }))}
                className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", pageContent.reviews_section?.enabled ? "bg-primary" : "bg-muted-foreground/30")}>
                <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", pageContent.reviews_section?.enabled ? "translate-x-4" : "translate-x-0")} />
              </button>
            </div>
            {pageContent.reviews_section?.enabled && (
              <div className="space-y-2">
                <input type="text" value={pageContent.reviews_section.title} className={inputCls}
                  placeholder="Ce spun clientii nostri"
                  onChange={e => setPageContent(p => ({ ...p, reviews_section: { ...p.reviews_section!, title: e.target.value } }))} />
                {pageContent.reviews_section.items.map((item, i) => (
                  <div key={i} className="border border-border rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        {[1,2,3,4,5].map(star => (
                          <button key={star} type="button"
                            onClick={() => setPageContent(p => ({ ...p, reviews_section: { ...p.reviews_section!, items: p.reviews_section!.items.map((it, j) => j === i ? { ...it, rating: star } : it) } }))}
                            className="transition-transform hover:scale-125">
                            <svg viewBox="0 0 20 20" className="h-4 w-4" fill={star <= item.rating ? "#FBBF24" : "none"} stroke={star <= item.rating ? "#FBBF24" : "#D1D5DB"} strokeWidth="1.5">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          </button>
                        ))}
                      </div>
                      <button type="button"
                        onClick={() => setPageContent(p => ({ ...p, reviews_section: { ...p.reviews_section!, items: p.reviews_section!.items.filter((_, j) => j !== i) } }))}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.image ? (
                        <div className="relative flex-shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.image} alt="" className="w-9 h-9 rounded-full object-cover border border-border" />
                          <button type="button" aria-label="Sterge poza"
                            onClick={() => setPageContent(p => ({ ...p, reviews_section: { ...p.reviews_section!, items: p.reviews_section!.items.map((it, j) => j === i ? { ...it, image: undefined } : it) } }))}
                            className="absolute -top-1 -right-1 bg-destructive text-white rounded-full p-0.5 shadow">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ) : (
                        <label className="w-9 h-9 rounded-full border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors flex-shrink-0">
                          {reviewUploadIdx === i
                            ? <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
                            : <Upload className="h-3.5 w-3.5 text-muted-foreground" />}
                          <input type="file" accept="image/*" className="hidden" disabled={reviewUploadIdx !== null}
                            onChange={async e => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (!f) return;
                              setReviewUploadIdx(i);
                              const url = await uploadFile(f, "avatars");
                              setReviewUploadIdx(null);
                              if (url) setPageContent(p => ({ ...p, reviews_section: { ...p.reviews_section!, items: p.reviews_section!.items.map((it, j) => j === i ? { ...it, image: url } : it) } }));
                            }} />
                        </label>
                      )}
                      <span className="text-[10px] text-muted-foreground">Poza (optional). Fara poza se afiseaza initiala.</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" value={item.name} placeholder="Numele clientului" className={inputCls + " !py-1.5 !text-xs"}
                        onChange={e => setPageContent(p => ({ ...p, reviews_section: { ...p.reviews_section!, items: p.reviews_section!.items.map((it, j) => j === i ? { ...it, name: e.target.value } : it) } }))} />
                      <input type="date" value={item.date} className={inputCls + " !py-1.5 !text-xs"}
                        onChange={e => setPageContent(p => ({ ...p, reviews_section: { ...p.reviews_section!, items: p.reviews_section!.items.map((it, j) => j === i ? { ...it, date: e.target.value } : it) } }))} />
                    </div>
                    <textarea value={item.text} rows={2} placeholder="Textul recenziei..." className={inputCls + " !py-1.5 !text-xs resize-none"}
                      onChange={e => setPageContent(p => ({ ...p, reviews_section: { ...p.reviews_section!, items: p.reviews_section!.items.map((it, j) => j === i ? { ...it, text: e.target.value } : it) } }))} />
                  </div>
                ))}
                {(pageContent.reviews_section.items.length < 20) && (
                  <button type="button"
                    onClick={() => setPageContent(p => ({ ...p, reviews_section: { ...p.reviews_section!, items: [...p.reviews_section!.items, { name: "", rating: 5, text: "", date: new Date().toISOString().split("T")[0] }] } }))}
                    className="flex items-center gap-1 text-xs text-primary hover:underline">
                    <Plus className="h-3 w-3" /> Adauga recenzie
                  </button>
                )}
              </div>
            )}
          </div>

          <hr className="border-border" />

          {/* Announcement bar on store */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-semibold text-foreground">Announcement bar pe magazin</label>
              <p className="text-[10px] text-muted-foreground mt-0.5">Afiseaza bannerul scrolling si pe pagina magazinului</p>
            </div>
            <button type="button"
              onClick={() => setPageContent(p => ({ ...p, show_announcement_on_store: !p.show_announcement_on_store }))}
              className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", pageContent.show_announcement_on_store ? "bg-primary" : "bg-muted-foreground/30")}>
              <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", pageContent.show_announcement_on_store ? "translate-x-4" : "translate-x-0")} />
            </button>
          </div>

          <hr className="border-border" />

          {/* Sort options */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold text-foreground">Sortare produse</label>
                <p className="text-[10px] text-muted-foreground mt-0.5">Permite clientilor sa sorteze produsele</p>
              </div>
              <button type="button"
                onClick={() => setPageContent(p => ({ ...p, sort_options: { ...p.sort_options!, enabled: !p.sort_options?.enabled } }))}
                className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", pageContent.sort_options?.enabled ? "bg-primary" : "bg-muted-foreground/30")}>
                <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", pageContent.sort_options?.enabled ? "translate-x-4" : "translate-x-0")} />
              </button>
            </div>
            {pageContent.sort_options?.enabled && (
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Sortare implicita</label>
                <select value={pageContent.sort_options.default_sort ?? "newest"} className={inputCls + " !py-1.5 !text-xs"}
                  onChange={e => setPageContent(p => ({ ...p, sort_options: { ...p.sort_options!, default_sort: e.target.value } }))}>
                  <option value="newest">Cele mai noi</option>
                  <option value="price_asc">Pret crescator</option>
                  <option value="price_desc">Pret descrescator</option>
                  <option value="popular">Populare</option>
                  <option value="name_asc">Alfabetic A-Z</option>
                </select>
              </div>
            )}
          </div>

          <hr className="border-border" />

          {/* Sticky cart bar */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-semibold text-foreground">Bara cos pe mobil</label>
              <p className="text-[10px] text-muted-foreground mt-0.5">Buton floating jos cu numarul de produse si totalul</p>
            </div>
            <button type="button"
              onClick={() => setPageContent(p => ({ ...p, sticky_cart_bar: { enabled: !p.sticky_cart_bar?.enabled } }))}
              className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", pageContent.sticky_cart_bar?.enabled ? "bg-primary" : "bg-muted-foreground/30")}>
              <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", pageContent.sticky_cart_bar?.enabled ? "translate-x-4" : "translate-x-0")} />
            </button>
          </div>

          <hr className="border-border" />

          {/* New badge */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold text-foreground">Badge "Nou" pe produse</label>
                <p className="text-[10px] text-muted-foreground mt-0.5">Afiseaza automat badge pe produsele adaugate recent</p>
              </div>
              <button type="button"
                onClick={() => setPageContent(p => ({ ...p, new_badge: { ...p.new_badge!, enabled: !p.new_badge?.enabled } }))}
                className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", pageContent.new_badge?.enabled ? "bg-primary" : "bg-muted-foreground/30")}>
                <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", pageContent.new_badge?.enabled ? "translate-x-4" : "translate-x-0")} />
              </button>
            </div>
            {pageContent.new_badge?.enabled && (
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Numarul de zile considerate "nou"</label>
                <input type="number" min={1} max={90} value={pageContent.new_badge.days ?? 7} className={inputCls + " !py-1.5 !text-xs"}
                  onChange={e => setPageContent(p => ({ ...p, new_badge: { ...p.new_badge!, days: parseInt(e.target.value) || 7 } }))} />
              </div>
            )}
          </div>

          <SaveBtn loading={saving === "page"} saved={saved === "page"} onSave={savePageContent} />
        </div>
      ),
    },
    {
      id: "checkout",
      icon: ClipboardList,
      title: "Formular de comanda",
      content: (
        <div className="px-5 pb-5 space-y-5">
          <div className="p-3 bg-muted/50 rounded-xl">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Campurile standard (Nume, Telefon, Judet, Oras, Adresa) sunt incluse automat. Poti ascunde campurile optionale sau adauga campuri si optiuni extra.
            </p>
          </div>

          {/* Standard fields toggles */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Campuri standard</p>

            {/* Discount code */}
            {[
              { id: "discount", label: "Cod discount", desc: "Permite clientilor sa aplice un cod de reducere" },
            ].map(field => {
              const hidden = (pageContent.checkout_config?.hidden_fields ?? []).includes(field.id);
              return (
                <div key={field.id} className="flex items-center justify-between p-3 border border-border rounded-xl">
                  <div>
                    <p className="text-xs font-medium text-foreground">{field.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{field.desc}</p>
                  </div>
                  <button type="button"
                    onClick={() => {
                      const current = pageContent.checkout_config?.hidden_fields ?? [];
                      const next = hidden ? current.filter(f => f !== field.id) : [...current, field.id];
                      setPageContent(p => ({ ...p, checkout_config: { ...p.checkout_config!, hidden_fields: next } }));
                    }}
                    className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", !hidden ? "bg-primary" : "bg-muted-foreground/30")}>
                    <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", !hidden ? "translate-x-4" : "translate-x-0")} />
                  </button>
                </div>
              );
            })}

            {/* Email field */}
            {(() => {
              const emailField = pageContent.checkout_config?.email_field ?? { enabled: false, required: false };
              return (
                <div className="border border-border rounded-xl p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-foreground">Camp Email</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Clientul poate introduce adresa de email pentru confirmare comanda</p>
                    </div>
                    <button type="button"
                      onClick={() => setPageContent(p => ({ ...p, checkout_config: { ...p.checkout_config!, email_field: { ...emailField, enabled: !emailField.enabled } } }))}
                      className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", emailField.enabled ? "bg-primary" : "bg-muted-foreground/30")}>
                      <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", emailField.enabled ? "translate-x-4" : "translate-x-0")} />
                    </button>
                  </div>
                  {emailField.enabled && (
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <div>
                        <p className="text-xs font-medium text-foreground">Obligatoriu</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Daca e dezactivat, campul apare ca optional</p>
                      </div>
                      <button type="button"
                        onClick={() => setPageContent(p => ({ ...p, checkout_config: { ...p.checkout_config!, email_field: { ...emailField, required: !emailField.required } } }))}
                        className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", emailField.required ? "bg-primary" : "bg-muted-foreground/30")}>
                        <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", emailField.required ? "translate-x-4" : "translate-x-0")} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          <hr className="border-border" />

          {/* Custom fields */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Campuri suplimentare</p>
            <p className="text-[10px] text-muted-foreground">Campuri de text, liste sau bife pe care clientul le completeaza la comanda.</p>
            {(pageContent.checkout_config?.custom_fields ?? []).map((field, i) => (
              <div key={field.id} className="border border-border rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <input type="text" value={field.label} placeholder="Eticheta camp" className={inputCls + " !py-1.5 !text-xs"}
                    onChange={e => setPageContent(p => ({ ...p, checkout_config: { ...p.checkout_config!, custom_fields: p.checkout_config!.custom_fields!.map((f, j) => j === i ? { ...f, label: e.target.value } : f) } }))} />
                  <button type="button" onClick={() => setPageContent(p => ({ ...p, checkout_config: { ...p.checkout_config!, custom_fields: p.checkout_config!.custom_fields!.filter((_, j) => j !== i) } }))}
                    className="p-1.5 text-muted-foreground hover:text-destructive flex-shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Tip</label>
                    <select value={field.type} className={inputCls + " !py-1.5 !text-xs"}
                      onChange={e => setPageContent(p => ({ ...p, checkout_config: { ...p.checkout_config!, custom_fields: p.checkout_config!.custom_fields!.map((f, j) => j === i ? { ...f, type: e.target.value as never } : f) } }))}>
                      <option value="text">Text scurt</option>
                      <option value="textarea">Text lung</option>
                      <option value="select">Lista optiuni</option>
                      <option value="checkbox">Bifa (Da/Nu)</option>
                    </select>
                  </div>
                  <div className="flex items-end gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                      <input type="checkbox" checked={field.required}
                        onChange={e => setPageContent(p => ({ ...p, checkout_config: { ...p.checkout_config!, custom_fields: p.checkout_config!.custom_fields!.map((f, j) => j === i ? { ...f, required: e.target.checked } : f) } }))}
                        className="rounded" />
                      Obligatoriu
                    </label>
                  </div>
                </div>
                {field.type === "select" && (
                  <div>
                    <label className="text-[10px] text-muted-foreground">Optiuni (separate prin virgula)</label>
                    <input type="text" value={field.options ?? ""} placeholder="Optiunea 1, Optiunea 2" className={inputCls + " !py-1.5 !text-xs"}
                      onChange={e => setPageContent(p => ({ ...p, checkout_config: { ...p.checkout_config!, custom_fields: p.checkout_config!.custom_fields!.map((f, j) => j === i ? { ...f, options: e.target.value } : f) } }))} />
                  </div>
                )}
                {(field.type === "text" || field.type === "textarea") && (
                  <input type="text" value={field.placeholder ?? ""} placeholder="Placeholder (optional)" className={inputCls + " !py-1.5 !text-xs"}
                    onChange={e => setPageContent(p => ({ ...p, checkout_config: { ...p.checkout_config!, custom_fields: p.checkout_config!.custom_fields!.map((f, j) => j === i ? { ...f, placeholder: e.target.value } : f) } }))} />
                )}
              </div>
            ))}
            <button type="button"
              onClick={() => setPageContent(p => ({ ...p, checkout_config: { ...p.checkout_config!, custom_fields: [...(p.checkout_config!.custom_fields ?? []), { id: `cf_${Date.now()}`, label: "", type: "text" as const, required: false, placeholder: "" }] } }))}
              className="flex items-center gap-1 text-xs text-primary hover:underline">
              <Plus className="h-3 w-3" /> Adauga camp
            </button>
          </div>

          <hr className="border-border" />

          {/* Extras */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Optiuni extra platite</p>
            <p className="text-[10px] text-muted-foreground">Afisate cu border punctat in formular. Clientul le poate bifa si se adauga la total.</p>
            {(pageContent.checkout_config?.extras ?? []).map((extra, i) => (
              <div key={extra.id} className="border-2 border-dashed border-border rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <input type="text" value={extra.label} placeholder="ex: Prioritizeaza comanda mea" className={inputCls + " !py-1.5 !text-xs"}
                    onChange={e => setPageContent(p => ({ ...p, checkout_config: { ...p.checkout_config!, extras: p.checkout_config!.extras!.map((ex, j) => j === i ? { ...ex, label: e.target.value } : ex) } }))} />
                  <button type="button" onClick={() => setPageContent(p => ({ ...p, checkout_config: { ...p.checkout_config!, extras: p.checkout_config!.extras!.filter((_, j) => j !== i) } }))}
                    className="p-1.5 text-muted-foreground hover:text-destructive flex-shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Pret (lei)</label>
                    <input type="number" value={extra.price} min={0} className={inputCls + " !py-1.5 !text-xs"}
                      onChange={e => setPageContent(p => ({ ...p, checkout_config: { ...p.checkout_config!, extras: p.checkout_config!.extras!.map((ex, j) => j === i ? { ...ex, price: Number(e.target.value) } : ex) } }))} />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Descriere scurta (optional)</label>
                    <input type="text" value={extra.description ?? ""} placeholder="ex: livrat in 24h" className={inputCls + " !py-1.5 !text-xs"}
                      onChange={e => setPageContent(p => ({ ...p, checkout_config: { ...p.checkout_config!, extras: p.checkout_config!.extras!.map((ex, j) => j === i ? { ...ex, description: e.target.value } : ex) } }))} />
                  </div>
                </div>
              </div>
            ))}
            <button type="button"
              onClick={() => setPageContent(p => ({ ...p, checkout_config: { ...p.checkout_config!, extras: [...(p.checkout_config!.extras ?? []), { id: `ext_${Date.now()}`, label: "", price: 0, description: "" }] } }))}
              className="flex items-center gap-1 text-xs text-primary hover:underline">
              <Plus className="h-3 w-3" /> Adauga optiune extra
            </button>
          </div>

          <SaveBtn loading={saving === "checkout"} saved={saved === "checkout"} onSave={saveCheckoutConfig} />
        </div>
      ),
    },
    {
      id: "publish",
      icon: Globe,
      title: "Publicare",
      content: (
        <div className="px-5 pb-5 space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-xl">
            <div>
              <p className="text-sm font-semibold text-foreground">{isPublished ? "Magazin publicat" : "Magazin nepublicat"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isPublished ? "Clientii pot vedea si cumpara din magazinul tau." : "Magazinul nu este vizibil publicului."}
              </p>
            </div>
            <button type="button" onClick={togglePublish} disabled={publishLoading}
              className={cn("relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30",
                isPublished ? "bg-primary" : "bg-muted-foreground/30")}>
              {publishLoading && <Loader2 className="absolute inset-0 m-auto h-3 w-3 animate-spin text-white z-10" />}
              <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
                isPublished ? "translate-x-5" : "translate-x-0")} />
            </button>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
            <span className="text-xs font-mono text-muted-foreground truncate flex-1">{publicUrl}</span>
            <a href={publicUrl} target="_blank" rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 transition-colors flex-shrink-0">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left panel */}
      <div className={cn("w-full lg:w-[380px] flex-shrink-0 flex flex-col border-r border-border bg-surface", mobileView === "preview" && "hidden lg:flex")}>
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-semibold text-foreground">Editeaza magazinul</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Modificarile se salveaza separat pentru fiecare sectiune</p>
            </div>
            {/* Mobile view switcher */}
            <div className="flex lg:hidden bg-muted rounded-xl p-1 gap-0.5">
              <button type="button" onClick={() => setMobileView("editor")}
                className={cn("p-1.5 rounded-lg transition-colors", mobileView === "editor" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground")}>
                <Monitor className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setMobileView("preview")}
                className={cn("p-1.5 rounded-lg transition-colors", mobileView === "preview" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground")}>
                <Smartphone className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
        <div className="divide-y divide-border overflow-y-auto flex-1">
          {sections.map((s) => (
            <div key={s.id}>
              <SectionHeader icon={s.icon} title={s.title} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} />
              {open === s.id && s.content}
            </div>
          ))}
        </div>
      </div>

      {/* Right: preview — always visible on desktop, switchable on mobile */}
      <div className={cn("flex-1 flex-col", mobileView === "preview" ? "flex" : "hidden lg:flex")}>
        <div className="px-5 py-3 border-b border-border bg-surface flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Mobile back to editor */}
            <button type="button" onClick={() => setMobileView("editor")}
              className="lg:hidden flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <Monitor className="h-3.5 w-3.5" />
              Editor
            </button>
            <span className="text-sm font-medium text-foreground">Previzualizare</span>
          </div>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-primary hover:underline">
            <ExternalLink className="h-3.5 w-3.5" />
            Deschide in tab nou
          </a>
        </div>
        <div className="flex-1 bg-muted/30 flex items-center justify-center p-4 lg:p-6">
          <div className="w-full max-w-sm h-full max-h-[750px] bg-surface rounded-2xl border border-border shadow-lg overflow-hidden">
            <iframe key={previewKey} src={previewUrl} className="w-full h-full" title="Previzualizare magazin" />
          </div>
        </div>
      </div>
    </div>
  );
}
