"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Boxes, CheckCircle, Cookie, ExternalLink, Fingerprint, Loader2, Send, Server } from "lucide-react";
import { saveMarketingConfig } from "@/lib/actions/marketing.actions";
import { saveMetaCapi, removeMetaCapi, trimiteEvenimentDeTestMeta, type StareMetaCapi } from "@/lib/actions/meta-capi.actions";
import { type MarketingConfig, parseMetaPixelId } from "@/lib/marketing-config";
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
        toast.error("Pixel ID invalid. Copiază doar ID-ul numeric (15-16 cifre) din Events Manager.");
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
      toast.success(raw ? "Pixelul Meta a fost salvat." : "Pixelul Meta a fost eliminat.");
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
      toast.success("Conversions API oprit. Pixelul din browser rămâne activ.");
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
      toast.success("Meta a primit evenimentul de test. Îl vezi în Events Manager, la Test events.");
    } catch {
      toast.error("Nu am primit raspuns de la server. Incearca din nou.", { duration: 12000 });
    } finally {
      setCapiBusy("");
    }
  }

  const salvat = (initialConfig?.facebook_pixel_id ?? "").trim();
  const modificat = pixelId.trim() !== salvat;
  const stari: StareAntet[] = !isActive
    ? [{ ton: "neutru", text: "Neconfigurat" }]
    : [
      { ton: "bun", text: "Pixel activ" },
      capi?.activ
        ? (capi.ultimaEroare ? { ton: "rau", text: "Conversions API: eroare" } : { ton: "bun", text: "Conversions API activ" })
        : { ton: "neutru", text: "Fără Conversions API" },
    ];
  const legatura = "inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline";

  return (
    <PaginaIntegrare
      id="facebook-pixel"
      titlu="Pixel Meta"
      descriere="Urmărește vizitele și vânzările, ca să optimizezi reclamele pe Facebook și Instagram."
      stari={stari}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Pixel ID salvat", facut: isActive },
          { text: "Conversions API activ", facut: !!capi?.activ },
          { text: "Fără cod de test rămas", facut: !!capi?.activ && !capi.testEventCode },
        ]} />
        <CardCifre titlu="Evenimente trimise automat" randuri={EVENIMENTE_META.map(([nume, cand]) => ({
          eticheta: <span className="font-mono text-foreground">{nume}</span>,
          valoare: <span className="text-muted-foreground">{cand}</span>,
        }))} />
        <CumFunctioneaza id="facebook-pixel" puncte={[
          { Icon: Fingerprint, text: "Pixel ID-ul îl iei din Events Manager: alegi pixelul și copiezi ID-ul numeric (15-16 cifre)." },
          { Icon: Server, text: "Conversions API trimite aceleași evenimente și de pe server, iar Meta păstrează unul din fiecare pereche." },
          { Icon: Boxes, text: "Produsele au aceleași ID-uri ca în feedul Facebook Catalog, deci reclamele dinamice le recunosc." },
          { Icon: Cookie, text: "Pixelii se încarcă doar după acordul de cookie-uri al vizitatorului (GDPR)." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Pixel ID" descriere="Identificatorul pixelului tău din Meta Events Manager.">
        <Field label="Pixel ID" htmlFor="meta-pixel" hint="Poți lipi și tot codul pixelului: păstrăm doar ID-ul.">
          <Input id="meta-pixel" type="text" value={pixelId} onChange={e => setPixelId(e.target.value)} placeholder="ex: 1234567890123456" className="font-mono" />
        </Field>
        <a href="https://business.facebook.com/events_manager" target="_blank" rel="noopener noreferrer" className={legatura}>
          Deschide Events Manager <ExternalLink className="h-3 w-3" />
        </a>
      </Sectiune>

      {/*
        ⚠ CONVERSIONS API: evenimentele pleaca si de pe server, cu acelasi ID ca din browser, deci Meta le numara
        o data. Ce pierde browserul (iOS, blocante de reclame, browserul din aplicatia Facebook) ajunge oricum.
      */}
      <Sectiune pas={2} titlu="Conversions API (recomandat)"
        descriere="Trimite evenimentele și de pe server: achizițiile blocate de iOS, de blocantele de reclame sau de browserul din aplicația Facebook ajung totuși la Meta.">
        {!isActive ? (
          <p className="text-sm text-muted-foreground">Salvează întâi Pixel ID-ul de mai sus.</p>
        ) : (
          <>
            {capi?.tokenSalvat && !capi.activ && (
              <Callout variant="warning" icon={AlertTriangle} title="Conversions API oprit: Pixel ID-ul s-a schimbat">
                Tokenul salvat a fost verificat pe pixelul de dinainte, deci nu mai trimitem nimic de pe server. Apasă
                „Verifică și salvează” ca să-l verificăm pe pixelul nou, sau lipește tokenul generat din setările lui.
              </Callout>
            )}
            {capi?.activ && !capi.ultimaEroare && (
              <Callout variant="success" icon={CheckCircle} title="Conversions API activ">
                {capi.ultimaTrimitereLa ? `Ultima achiziție trimisă: ${cand(capi.ultimaTrimitereLa)}.` : "Încă nicio achiziție trimisă de la salvare."}
              </Callout>
            )}
            {capi?.activ && capi.ultimaEroare && (
              <Callout variant="danger" icon={AlertTriangle} title="Meta a refuzat ultima trimitere">
                {capi.ultimaEroare}{capi.ultimaEroareLa ? ` (${cand(capi.ultimaEroareLa)})` : ""}. Dacă tokenul a expirat sau a fost
                șters, generează altul și salvează-l aici.
              </Callout>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Token de acces" htmlFor="meta-token"
                ajutor={<ExplicatieCard marime="mic" intrebare="De unde îl iau" eticheta="Tokenul Conversions API"
                  text="În Events Manager alegi pixelul, intri la Setări, cauți secțiunea Conversions API și apeși Generează tokenul de acces. Îl copiezi și îl lipești aici." />}>
                <Input
                  id="meta-token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={capi?.tokenSalvat ? PLACEHOLDER_SECRET_SALVAT : "EAA..."}
                  className="font-mono"
                />
              </Field>
              <Field label="Cod de test (opțional)" htmlFor="meta-test"
                hint="Din Events Manager, Test events. Cât timp e completat, evenimentele de pe server NU intră în rapoarte: șterge-l după verificare.">
                <Input id="meta-test" type="text" value={testCode} onChange={(e) => setTestCode(e.target.value)} placeholder="TEST12345" className="font-mono" />
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={salveazaCapi} disabled={capiBusy !== "" || (!token.trim() && !capi?.tokenSalvat)}>
                {capiBusy === "salvare" && <Loader2 className="animate-spin" />} {capi?.activ ? "Salvează modificările" : "Verifică și salvează"}
              </Button>
              {capi?.tokenSalvat && (
                <Button variant="outline" onClick={testeazaCapi} disabled={capiBusy !== "" || !capi.testEventCode}
                  title={capi.testEventCode ? undefined : "Salvează întâi un cod de test"}>
                  {capiBusy === "test" ? <Loader2 className="animate-spin" /> : <Send />} Trimite un eveniment de test
                </Button>
              )}
              {capi?.tokenSalvat && (
                <Button variant="ghost" onClick={stergeCapi} disabled={capiBusy !== ""}>
                  {capiBusy === "stergere" && <Loader2 className="animate-spin" />} Oprește Conversions API
                </Button>
              )}
            </div>
          </>
        )}
      </Sectiune>

      <Sectiune titlu="Cum verifici că pixelul funcționează">
        <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-muted-foreground">
          <li>Instalează extensia <span className="font-medium text-foreground">Meta Pixel Helper</span> în Chrome.</li>
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

const EVENIMENTE_META: [string, string][] = [
  ["PageView", "fiecare pagină"],
  ["ViewContent", "pagina unui produs"],
  ["Search", "căutarea în magazin"],
  ["AddToCart", "adăugarea în coș"],
  ["InitiateCheckout", "începutul comenzii"],
  ["AddPaymentInfo", "trimiterea comenzii"],
  ["Purchase", "vânzarea: ramburs la plasare, card la încasare"],
];
