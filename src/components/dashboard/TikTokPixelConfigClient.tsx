"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Boxes, CheckCircle, Cookie, ExternalLink, Fingerprint, Loader2, Server } from "lucide-react";
import { saveMarketingConfig } from "@/lib/actions/marketing.actions";
import { saveTikTokCapi, removeTikTokCapi, type StareTikTokCapi } from "@/lib/actions/tiktok-capi.actions";
import { type MarketingConfig, parseTikTokPixelId } from "@/lib/marketing-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";
import { PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";
import {
  BaraSalvare, CardCifre, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, Sectiune, type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";

function cand(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" });
}

export function TikTokPixelConfigClient({
  businessId,
  initialConfig,
  capi,
}: {
  businessId: string;
  initialConfig: MarketingConfig | null;
  capi: StareTikTokCapi | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [pixelId, setPixelId] = useState(initialConfig?.tiktok_pixel_id ?? "");
  const [token, setToken] = useState("");
  const [capiBusy, setCapiBusy] = useState<"" | "salvare" | "stergere">("");

  async function salveazaCapi() {
    setCapiBusy("salvare");
    try {
      const r = await saveTikTokCapi(businessId, { token });
      if ("error" in r) { toast.error(r.error, { duration: 12000 }); return; }
      setToken("");
      toast.success(r.avertisment ?? "Events API salvat.", { duration: r.avertisment ? 12000 : 5000 });
      router.refresh();
    } catch {
      toast.error("Nu am primit raspuns de la server, deci nu stim daca s-a salvat. Reimprospateaza pagina.", { duration: 12000 });
    } finally {
      setCapiBusy("");
    }
  }

  async function stergeCapi() {
    setCapiBusy("stergere");
    try {
      const r = await removeTikTokCapi(businessId);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success("Events API oprit. Pixelul din browser rămâne activ.");
      router.refresh();
    } catch {
      toast.error("Nu am primit raspuns de la server. Reimprospateaza pagina ca sa vezi starea.", { duration: 12000 });
    } finally {
      setCapiBusy("");
    }
  }

  const isActive = !!initialConfig?.tiktok_pixel_id?.trim();

  async function handleSave() {
    const raw = pixelId.trim();
    // Extract the bare ID if the merchant pasted the whole base-code snippet;
    // reject obviously invalid input before hitting the server.
    if (raw) {
      const parsed = parseTikTokPixelId(raw);
      if (!parsed) {
        toast.error("Pixel ID invalid. Copiază ID-ul din TikTok Events Manager (ex: C4ABCDEF...).");
        return;
      }
      if (parsed !== raw) setPixelId(parsed); // snippet pasted → show clean ID
    }

    setSaving(true);
    const result = await saveMarketingConfig(businessId, {
      ...initialConfig,
      tiktok_pixel_id: raw || undefined,
    });
    setSaving(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(raw ? "Pixelul TikTok a fost salvat." : "Pixelul TikTok a fost eliminat.");
      router.refresh();
    }
  }

  const salvat = (initialConfig?.tiktok_pixel_id ?? "").trim();
  const modificat = pixelId.trim() !== salvat;
  const stari: StareAntet[] = !isActive
    ? [{ ton: "neutru", text: "Neconfigurat" }]
    : [
      { ton: "bun", text: "Pixel activ" },
      capi?.activ
        ? (capi.ultimaEroare ? { ton: "rau", text: "Events API: eroare" } : { ton: "bun", text: "Events API activ" })
        : { ton: "neutru", text: "Fără Events API" },
    ];
  const legatura = "inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline";

  return (
    <PaginaIntegrare
      id="tiktok-pixel"
      titlu="Pixel TikTok"
      descriere="Urmărește vizitele și vânzările, ca să optimizezi reclamele pe TikTok."
      stari={stari}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Pixel ID salvat", facut: isActive },
          { text: "Events API activ", facut: !!capi?.activ },
        ]} />
        <CardCifre titlu="Evenimente trimise automat" randuri={EVENIMENTE_TIKTOK.map(([nume, cand]) => ({
          eticheta: <span className="font-mono text-foreground">{nume}</span>,
          valoare: <span className="text-muted-foreground">{cand}</span>,
        }))} />
        <CumFunctioneaza id="tiktok-pixel" puncte={[
          { Icon: Fingerprint, text: "Pixel ID-ul îl iei din TikTok Ads Manager: Assets, Events." },
          { Icon: Server, text: "Events API trimite aceleași evenimente și de pe server, iar TikTok păstrează unul din fiecare pereche." },
          { Icon: Boxes, text: "Produsele au aceleași ID-uri ca în feedul de catalog, deci reclamele de catalog le recunosc." },
          { Icon: Cookie, text: "Pixelii se încarcă doar după acordul de cookie-uri al vizitatorului (GDPR)." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Pixel ID" descriere="Identificatorul pixelului tău din TikTok Events Manager.">
        <Field label="Pixel ID" htmlFor="tiktok-pixel" hint="Poți lipi și tot codul pixelului: păstrăm doar ID-ul.">
          <Input id="tiktok-pixel" type="text" value={pixelId} onChange={e => setPixelId(e.target.value)} placeholder="ex: C4ABCDEF1234567890" className="font-mono" />
        </Field>
        <a href="https://ads.tiktok.com/i18n/events_manager" target="_blank" rel="noopener noreferrer" className={legatura}>
          Deschide TikTok Events Manager <ExternalLink className="h-3 w-3" />
        </a>
      </Sectiune>

      {/*
        ⚠ EVENTS API: evenimentele pleaca si de pe server, cu acelasi `event_id` ca din browser, deci TikTok
        le numara o data. Ce pierde browserul (blocante de reclame, pagina inchisa prea repede) ajunge oricum.
      */}
      <Sectiune pas={2} titlu="Events API (recomandat)"
        descriere="Trimite evenimentele și de pe server, nu doar din browser. TikTok recomandă amândouă căile și păstrează un singur eveniment din fiecare pereche.">
        {!isActive ? (
          <p className="text-sm text-muted-foreground">Salvează întâi Pixel ID-ul de mai sus.</p>
        ) : (
          <>
            {capi?.tokenSalvat && !capi.activ && (
              <Callout variant="warning" icon={AlertTriangle} title="Events API oprit: Pixel ID-ul s-a schimbat">
                Tokenul salvat era pentru pixelul de dinainte, deci nu mai trimitem nimic de pe server. Apasă
                „Salvează tokenul” ca să-l legăm de pixelul nou, sau lipește tokenul generat la el.
              </Callout>
            )}
            {capi?.activ && !capi.ultimaEroare && (
              <Callout variant="success" icon={CheckCircle} title="Events API activ">
                {capi.ultimaTrimitereLa ? `Ultima achiziție trimisă: ${cand(capi.ultimaTrimitereLa)}.` : "Încă nicio achiziție trimisă de la salvare."}
              </Callout>
            )}
            {capi?.activ && capi.ultimaEroare && (
              <Callout variant="danger" icon={AlertTriangle} title="TikTok a refuzat ultima trimitere">
                {capi.ultimaEroare}{capi.ultimaEroareLa ? ` (${cand(capi.ultimaEroareLa)})` : ""}. Dacă tokenul a expirat sau
                a fost șters, generează altul și salvează-l aici.
              </Callout>
            )}

            <Field label="Token de acces" htmlFor="tiktok-token"
              hint="Verificarea deplină o face TikTok abia la prima trimitere: dacă refuză ceva, motivul apare aici."
              ajutor={<ExplicatieCard marime="mic" intrebare="De unde îl iau" eticheta="Tokenul Events API"
                text="În Events Manager alegi pixelul, intri la Settings și apeși Generate access token. Îl copiezi și îl lipești aici." />}>
              <Input
                id="tiktok-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={capi?.tokenSalvat ? PLACEHOLDER_SECRET_SALVAT : "lipește tokenul din Events Manager"}
                className="font-mono"
              />
            </Field>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={salveazaCapi} disabled={capiBusy !== "" || (!token.trim() && !capi?.tokenSalvat)}>
                {capiBusy === "salvare" && <Loader2 className="animate-spin" />} Salvează tokenul
              </Button>
              {capi?.tokenSalvat && (
                <Button variant="ghost" onClick={stergeCapi} disabled={capiBusy !== ""}>
                  {capiBusy === "stergere" && <Loader2 className="animate-spin" />} Oprește Events API
                </Button>
              )}
            </div>
          </>
        )}
      </Sectiune>

      <Sectiune titlu="Cum verifici că pixelul funcționează">
        <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-muted-foreground">
          <li>Instalează extensia <span className="font-medium text-foreground">TikTok Pixel Helper</span> în Chrome.</li>
          <li>Deschide magazinul într-o fereastră <span className="font-medium text-foreground">incognito</span>.</li>
          <li>Dacă ai bannerul de cookie-uri activ, apasă <span className="font-medium text-foreground">Accepta</span>: pixelii se încarcă doar după consimțământ (GDPR). Fără acest pas, Pixel Helper nu vede nimic.</li>
          <li>Pixel Helper ar trebui să arate pixelul și evenimentul <span className="font-mono text-foreground">PageView</span>.</li>
        </ol>
        <p className="text-xs text-muted-foreground">
          Poți dezactiva bannerul din <span className="font-medium text-foreground">Setări, Banner Cookies</span>: pixelii se vor încărca fără consimțământ, iar răspunderea GDPR îți aparține.
        </p>
      </Sectiune>

      <BaraSalvare modificat={modificat} saving={saving} onSalveaza={handleSave} onRenunta={() => setPixelId(salvat)} />
    </PaginaIntegrare>
  );
}

const EVENIMENTE_TIKTOK: [string, string][] = [
  ["PageView", "fiecare pagină"],
  ["ViewContent", "pagina unui produs"],
  ["Search", "căutarea în magazin"],
  ["AddToCart", "adăugarea în coș"],
  ["InitiateCheckout", "începutul comenzii"],
  ["AddPaymentInfo", "trimiterea comenzii"],
  ["Purchase", "vânzarea: ramburs la plasare, card la încasare"],
];
