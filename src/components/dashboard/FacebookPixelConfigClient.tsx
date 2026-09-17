"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ExternalLink, CheckCircle, Search, Server, AlertTriangle, Send } from "lucide-react";
import { saveMarketingConfig } from "@/lib/actions/marketing.actions";
import { saveMetaCapi, removeMetaCapi, trimiteEvenimentDeTestMeta, type StareMetaCapi } from "@/lib/actions/meta-capi.actions";
import { type MarketingConfig, parseMetaPixelId } from "@/lib/marketing-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";

function cand(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" });
}

export function FacebookPixelConfigClient({
  businessId,
  initialConfig,
  capi,
}: {
  businessId: string;
  initialConfig: MarketingConfig | null;
  capi: StareMetaCapi | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [pixelId, setPixelId] = useState(initialConfig?.facebook_pixel_id ?? "");
  const [token, setToken] = useState("");
  const [testCode, setTestCode] = useState(capi?.testEventCode ?? "");
  const [capiBusy, setCapiBusy] = useState<"" | "salvare" | "stergere" | "test">("");

  const isActive = !!initialConfig?.facebook_pixel_id?.trim();

  async function handleSave() {
    const raw = pixelId.trim();
    // Extract the bare ID if the merchant pasted the whole base-code snippet;
    // reject obviously invalid input before hitting the server.
    if (raw) {
      const parsed = parseMetaPixelId(raw);
      if (!parsed) {
        toast.error("Facebook Pixel ID invalid. Copiaza doar ID-ul numeric (15-16 cifre) din Events Manager.");
        return;
      }
      if (parsed !== raw) setPixelId(parsed); // snippet pasted → show clean ID
    }

    setSaving(true);
    const result = await saveMarketingConfig(businessId, {
      ...initialConfig,
      facebook_pixel_id: raw || undefined,
    });
    setSaving(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(raw ? "Facebook Pixel salvat" : "Facebook Pixel eliminat");
      router.refresh();
    }
  }

  async function salveazaCapi() {
    setCapiBusy("salvare");
    try {
      const r = await saveMetaCapi(businessId, { token, testEventCode: testCode });
      if ("error" in r) { toast.error(r.error, { duration: 12000 }); return; }
      setToken("");
      toast.success("Conversions API salvat. Tokenul a fost verificat la Meta.");
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
      const r = await removeMetaCapi(businessId);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success("Conversions API oprit. Pixelul din browser ramane activ.");
      router.refresh();
    } catch {
      toast.error("Nu am primit raspuns de la server. Reimprospateaza pagina ca sa vezi starea.", { duration: 12000 });
    } finally {
      setCapiBusy("");
    }
  }

  async function testeazaCapi() {
    setCapiBusy("test");
    try {
      const r = await trimiteEvenimentDeTestMeta(businessId);
      if ("error" in r) { toast.error(r.error, { duration: 12000 }); return; }
      toast.success("Meta a primit evenimentul de test. Il vezi in Events Manager -> Test events.");
    } catch {
      toast.error("Nu am primit raspuns de la server. Incearca din nou.", { duration: 12000 });
    } finally {
      setCapiBusy("");
    }
  }

  return (
    <div className="space-y-6">
      {isActive && (
        <Callout variant="success" icon={CheckCircle} title="Facebook Pixel activ">
          <span className="font-mono">{initialConfig?.facebook_pixel_id}</span>
        </Callout>
      )}

      <Panel className="space-y-4 p-4">
        <h3 className="text-sm font-semibold text-foreground">Pixel ID</h3>
        <div>
          <Input
            type="text"
            value={pixelId}
            onChange={e => setPixelId(e.target.value)}
            placeholder="ex: 1234567890123456"
            className="font-mono"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Gaseste Pixel ID-ul in Facebook Business Manager &gt; Events Manager.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <a
            href="https://business.facebook.com/events_manager"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Deschide Events Manager
          </a>
          <Button size="lg" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {saving ? "Se salveaza..." : "Salveaza"}
          </Button>
        </div>
      </Panel>

      {/*
        ⚠ CONVERSIONS API: evenimentele pleaca si de pe server, cu acelasi ID ca din browser, deci Meta le numara
        o data. Ce pierde browserul (iOS, blocante de reclame, browserul din aplicatia Facebook) ajunge oricum.
      */}
      <Panel className="space-y-4 p-4">
        <div className="flex items-start gap-2">
          <Server className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Conversions API (recomandat)</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Trimite evenimentele si de pe server, nu doar din browser. Achizitiile blocate de iOS, de blocantele de
              reclame sau de browserul din aplicatia Facebook ajung totusi la Meta, iar Meta pastreaza un singur
              eveniment din fiecare pereche.
            </p>
          </div>
        </div>

        {!isActive ? (
          <p className="text-xs text-muted-foreground">Salveaza intai Pixel ID-ul de mai sus.</p>
        ) : (
          <>
            {capi?.tokenSalvat && !capi.activ && (
              <Callout variant="warning" icon={AlertTriangle} title="Conversions API oprit: Pixel ID-ul s-a schimbat">
                Tokenul salvat a fost verificat pe pixelul de dinainte, deci nu mai trimitem nimic de pe server. Apasa
                „Verifica si salveaza” ca sa-l verificam pe pixelul nou, sau lipeste tokenul generat din setarile lui.
              </Callout>
            )}
            {capi?.activ && !capi.ultimaEroare && (
              <Callout variant="success" icon={CheckCircle} title="Conversions API activ">
                {capi.ultimaTrimitereLa ? `Ultima achizitie trimisa: ${cand(capi.ultimaTrimitereLa)}.` : "Inca nicio achizitie trimisa de la salvare."}
              </Callout>
            )}
            {capi?.activ && capi.ultimaEroare && (
              <Callout variant="danger" icon={AlertTriangle} title="Meta a refuzat ultima trimitere">
                {capi.ultimaEroare}{capi.ultimaEroareLa ? ` (${cand(capi.ultimaEroareLa)})` : ""}. Daca tokenul a expirat sau a fost
                sters, genereaza altul si salveaza-l aici.
              </Callout>
            )}

            <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
              <li>Deschide <span className="font-medium text-foreground">Events Manager</span> si alege pixelul de mai sus.</li>
              <li>Mergi la <span className="font-medium text-foreground">Setari</span> si cauta sectiunea <span className="font-medium text-foreground">Conversions API</span>.</li>
              <li>Apasa <span className="font-medium text-foreground">Genereaza tokenul de acces</span>, copiaza-l si lipeste-l aici.</li>
            </ol>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Token de acces</label>
                <Input
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={capi?.tokenSalvat ? "•••••••• (salvat, completeaza doar ca sa-l schimbi)" : "EAA..."}
                  className="font-mono"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Cod de test (optional)</label>
                <Input
                  type="text"
                  value={testCode}
                  onChange={(e) => setTestCode(e.target.value)}
                  placeholder="TEST12345"
                  className="font-mono"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Din Events Manager &gt; Test events. Cat timp e completat, evenimentele de pe server apar acolo si NU intra
                  in rapoarte. Sterge-l dupa verificare.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {capi?.tokenSalvat && (
                <Button variant="outline" onClick={stergeCapi} disabled={capiBusy !== ""}>
                  {capiBusy === "stergere" && <Loader2 className="animate-spin" />} Opreste Conversions API
                </Button>
              )}
              {capi?.tokenSalvat && (
                <Button variant="outline" onClick={testeazaCapi} disabled={capiBusy !== "" || !capi.testEventCode}
                  title={capi.testEventCode ? undefined : "Salveaza intai un cod de test"}>
                  {capiBusy === "test" ? <Loader2 className="animate-spin" /> : <Send />} Trimite un eveniment de test
                </Button>
              )}
              <Button onClick={salveazaCapi} disabled={capiBusy !== "" || (!token.trim() && !capi?.tokenSalvat)}>
                {capiBusy === "salvare" && <Loader2 className="animate-spin" />} {capi?.activ ? "Salveaza modificarile" : "Verifica si salveaza"}
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
          <li><span className="font-mono text-foreground">Purchase</span>: la vanzarea confirmata (ramburs la plasare, card la incasare), cu valoare si potrivire avansata</li>
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Produsele se trimit cu aceleasi ID-uri ca in feedul Facebook Catalog (inclusiv variantele), deci reclamele
          dinamice recunosc ce a vazut si ce a cumparat fiecare vizitator.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Search className="h-4 w-4 text-primary" /> Cum verifici ca pixelul functioneaza
        </p>
        <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
          <li>Instaleaza extensia <span className="font-medium text-foreground">Meta Pixel Helper</span> in Chrome.</li>
          <li>Deschide magazinul intr-o fereastra <span className="font-medium text-foreground">incognito</span>.</li>
          <li>Daca ai bannerul de cookie-uri activ, apasa <span className="font-medium text-foreground">Accepta</span>: pixelii se incarca doar dupa consimtamant (GDPR). Fara acest pas, Pixel Helper nu vede nimic.</li>
          <li>Pixel Helper ar trebui sa arate pixelul si evenimentul <span className="font-mono text-foreground">PageView</span>.</li>
        </ol>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Poti dezactiva bannerul din <span className="font-medium text-foreground">Setari &gt; Banner Cookies</span> (pixelii se vor incarca fara consimtamant; raspunderea GDPR iti apartine).
        </p>
      </div>
    </div>
  );
}
