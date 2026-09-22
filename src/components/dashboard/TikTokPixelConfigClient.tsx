"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ExternalLink, CheckCircle, Search, Server, AlertTriangle } from "lucide-react";
import { saveMarketingConfig } from "@/lib/actions/marketing.actions";
import { saveTikTokCapi, removeTikTokCapi, type StareTikTokCapi } from "@/lib/actions/tiktok-capi.actions";
import { type MarketingConfig, parseTikTokPixelId } from "@/lib/marketing-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";

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
      toast.success("Events API oprit. Pixelul din browser ramane activ.");
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
        toast.error("TikTok Pixel ID invalid. Copiaza ID-ul din TikTok Events Manager (ex: C4ABCDEF...).");
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
      toast.success(raw ? "TikTok Pixel salvat" : "TikTok Pixel eliminat");
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {isActive && (
        <Callout variant="success" icon={CheckCircle} title="TikTok Pixel activ">
          <span className="font-mono">{initialConfig?.tiktok_pixel_id}</span>
        </Callout>
      )}

      <Panel className="space-y-4 p-4">
        <h3 className="text-sm font-semibold text-foreground">Pixel ID</h3>
        <div>
          <Input
            type="text"
            value={pixelId}
            onChange={e => setPixelId(e.target.value)}
            placeholder="ex: C4ABCDEF1234567890"
            className="font-mono"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Gaseste Pixel ID-ul in TikTok Ads Manager &gt; Assets &gt; Events.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <a
            href="https://ads.tiktok.com/i18n/events_manager"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Deschide TikTok Events Manager
          </a>
          <Button size="lg" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {saving ? "Se salveaza..." : "Salveaza"}
          </Button>
        </div>
      </Panel>

      {/*
        ⚠ EVENTS API: evenimentele pleaca si de pe server, cu acelasi `event_id` ca din browser, deci TikTok
        le numara o data. Ce pierde browserul (blocante de reclame, pagina inchisa prea repede) ajunge oricum.
      */}
      <Panel className="space-y-4 p-4">
        <div className="flex items-start gap-2">
          <Server className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Events API (recomandat)</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Trimite evenimentele si de pe server, nu doar din browser. TikTok recomanda amandoua caile si
              pastreaza un singur eveniment din fiecare pereche.
            </p>
          </div>
        </div>

        {!isActive ? (
          <p className="text-xs text-muted-foreground">Salveaza intai Pixel ID-ul de mai sus.</p>
        ) : (
          <>
            {capi?.tokenSalvat && !capi.activ && (
              <Callout variant="warning" icon={AlertTriangle} title="Events API oprit: Pixel ID-ul s-a schimbat">
                Tokenul salvat era pentru pixelul de dinainte, deci nu mai trimitem nimic de pe server. Apasa
                „Salveaza tokenul” ca sa-l legam de pixelul nou, sau lipeste tokenul generat la el.
              </Callout>
            )}
            {capi?.activ && !capi.ultimaEroare && (
              <Callout variant="success" icon={CheckCircle} title="Events API activ">
                {capi.ultimaTrimitereLa ? `Ultima achizitie trimisa: ${cand(capi.ultimaTrimitereLa)}.` : "Inca nicio achizitie trimisa de la salvare."}
              </Callout>
            )}
            {capi?.activ && capi.ultimaEroare && (
              <Callout variant="danger" icon={AlertTriangle} title="TikTok a refuzat ultima trimitere">
                {capi.ultimaEroare}{capi.ultimaEroareLa ? ` (${cand(capi.ultimaEroareLa)})` : ""}. Daca tokenul a expirat sau
                a fost sters, genereaza altul si salveaza-l aici.
              </Callout>
            )}

            <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
              <li>Deschide <span className="font-medium text-foreground">Events Manager</span> si alege pixelul de mai sus.</li>
              <li>Intra la <span className="font-medium text-foreground">Settings</span> si apasa <span className="font-medium text-foreground">Generate access token</span>.</li>
              <li>Copiaza tokenul si lipeste-l aici.</li>
            </ol>

            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Token de acces</label>
              <Input
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={capi?.tokenSalvat ? "•••••••• (salvat, completeaza doar ca sa-l schimbi)" : "lipeste tokenul din Events Manager"}
                className="font-mono"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Verificarea deplina o face TikTok abia la prima trimitere: daca refuza ceva, motivul apare aici.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {capi?.tokenSalvat && (
                <Button variant="outline" onClick={stergeCapi} disabled={capiBusy !== ""}>
                  {capiBusy === "stergere" && <Loader2 className="animate-spin" />} Opreste Events API
                </Button>
              )}
              <Button onClick={salveazaCapi} disabled={capiBusy !== "" || (!token.trim() && !capi?.tokenSalvat)}>
                {capiBusy === "salvare" && <Loader2 className="animate-spin" />} Salveaza tokenul
              </Button>
            </div>
          </>
        )}
      </Panel>

      <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
        <p className="mb-2 text-sm font-semibold text-foreground">Evenimente urmarite automat</p>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li><span className="font-mono text-foreground">PageView</span>: la fiecare pagina a magazinului</li>
          <li><span className="font-mono text-foreground">ViewContent</span>: la vizualizarea unui produs</li>
          <li><span className="font-mono text-foreground">Search</span>: la cautarea in magazin</li>
          <li><span className="font-mono text-foreground">AddToCart</span>: cand un produs e adaugat in cos</li>
          <li><span className="font-mono text-foreground">InitiateCheckout</span>: la inceputul comenzii</li>
          <li><span className="font-mono text-foreground">AddPaymentInfo</span>: la trimiterea comenzii, cu metoda de plata aleasa</li>
          <li><span className="font-mono text-foreground">Purchase</span>: la vanzarea confirmata (ramburs la plasare, card la incasare)</li>
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Produsele se trimit cu aceleasi ID-uri ca in feedul de catalog (inclusiv variantele), deci reclamele
          de catalog recunosc ce a vazut si ce a cumparat fiecare vizitator.
        </p>
      </div>

      <div className="rounded-xl ring-1 ring-foreground/10 bg-card p-4">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Search className="h-4 w-4 text-primary" /> Cum verifici ca pixelul functioneaza
        </p>
        <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
          <li>Instaleaza extensia <span className="font-medium text-foreground">TikTok Pixel Helper</span> in Chrome.</li>
          <li>Deschide magazinul intr-o fereastra <span className="font-medium text-foreground">incognito</span>.</li>
          <li>Daca ai bannerul de cookie-uri activ, apasa <span className="font-medium text-foreground">Accepta</span>: pixelii se incarca doar dupa consimtamant (GDPR). Fara acest pas, Pixel Helper nu vede nimic.</li>
          <li>Pixel Helper ar trebui sa arate pixelul si evenimentul <span className="font-mono text-foreground">PageView</span>.</li>
        </ol>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Poti dezactiva bannerul din <span className="font-medium text-foreground">Setari &gt; Banner Cookies</span> (pixelii se vor incarca fara consimtamant, raspunderea GDPR iti apartine).
        </p>
      </div>
    </div>
  );
}
