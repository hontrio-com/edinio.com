"use client";

import { useState, useTransition } from "react";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  BellOff, CheckCircle, Copy, ExternalLink, KeyRound, Loader2, Megaphone, MessageSquare, Phone, UserPlus, XCircle,
} from "lucide-react";
import { updateSmsoConfig } from "@/lib/actions/store.actions";
import type { SmsoConfig } from "@/lib/smso";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  BaraSalvare, CardCifre, ComutatorPrincipal, CumFunctioneaza, ListaConfigurare, PaginaIntegrare, Sectiune, useFormularIntegrare, type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";
import { Field } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import { ExplicatieCard } from "@/components/dashboard/ExplicatieCard";

export function SmsoConfigClient({
  businessId, initialConfig, webhookUrl, dezabonati, dezabonatiTotal,
}: {
  businessId: string;
  initialConfig: SmsoConfig;
  /** Adresa de raportare, compusa pe server. `null` cand lipseste secretul de semnare din mediu. */
  webhookUrl: string | null;
  /** Cei mai noi, cel mult doua sute. NU sunt neaparat toti: vezi `dezabonatiTotal`. */
  dezabonati: { phone: string; sursa: string; creat_la: string }[];
  /** ⚠ Cati sunt CU ADEVARAT. Antetul scria `dezabonati.length`, adica plafonul. */
  dezabonatiTotal: number;
}) {
  const router = useRouter();
  const { cfg: smso, setCfg: setSmso, modificat, marcheazaSalvat, renunta } = useFormularIntegrare<SmsoConfig>(initialConfig);
  const [saving, startSave] = useTransition();
  const [testLoading, setTestLoading] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; details?: string } | null>(null);

  function save() {
    if (smso.enabled && (!smso.api_key.trim() && !secretulEsteSalvat(initialConfig, "api_key"))) { toast.error("Cheia API este obligatorie."); return; }
    if (smso.enabled && !smso.sender_id.trim()) { toast.error("Sender ID este obligatoriu."); return; }
    startSave(async () => {
      let result: Awaited<ReturnType<typeof updateSmsoConfig>>;
      try {
        result = await updateSmsoConfig(businessId, smso);
      } catch {
        /* ⚠ Scrie configurarea SMSO. */
        toast.error(
          "Nu am primit raspuns de la server, deci nu stim daca configurarea SMSO s-a salvat. "
          + "Reimprospateaza pagina ca sa vezi cum a ramas, inainte sa salvezi din nou.",
          { duration: 12000 },
        );
        return;
      }
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Integrarea SMSO a fost salvată.");
        marcheazaSalvat();
        router.refresh();
      }
    });
  }

  async function sendTest() {
    if (!testPhone.trim()) { toast.error("Introdu un număr de telefon."); return; }
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/sms/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, api_key: smso.api_key, sender_id: smso.sender_id, phone: testPhone }),
      });
      const data = await res.json() as { success?: boolean; responseToken?: string; transaction_cost?: number; to?: string; error?: string };
      if (data.success) {
        setTestResult({ ok: true, message: `SMS trimis cu succes către ${data.to}`, details: `Cost: ${data.transaction_cost ?? "-"} | Token: ${data.responseToken}` });
      } else {
        setTestResult({ ok: false, message: data.error ?? "Eroare necunoscută" });
      }
    } catch (err) {
      setTestResult({ ok: false, message: `Eroare de rețea: ${String(err)}` });
    } finally {
      setTestLoading(false);
    }
  }

  const cheieSalvata = secretulEsteSalvat(initialConfig, "api_key");
  const configurat = !!((initialConfig.api_key || cheieSalvata) && initialConfig.sender_id);
  const arataTestul = !!((smso.api_key || cheieSalvata) && smso.sender_id);
  const stari: StareAntet[] = !configurat
    ? [{ ton: "neutru", text: "Neconfigurată" }]
    : [initialConfig.enabled ? { ton: "bun", text: "Activă" } : { ton: "neutru", text: "Oprită" }];
  const copiazaAdresa = (adresa: string) => {
    navigator.clipboard.writeText(adresa)
      .then(() => toast.success("Adresa a fost copiată."))
      .catch(() => toast.error("Nu am putut copia adresa. Selecteaz-o și copiaz-o manual."));
  };

  return (
    <PaginaIntegrare
      id="smso"
      titlu="SMS"
      descriere="Trimiți SMS-uri despre comenzi și campanii de marketing, prin contul tău SMSO."
      stari={stari}
      actiune={<ComutatorPrincipal eticheta="SMS prin SMSO" activ={smso.enabled} onChange={v => setSmso(s => ({ ...s, enabled: v }))} ariaLabel="Activează SMSO" />}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Cheia API", facut: !!smso.api_key.trim() || cheieSalvata },
          { text: "Sender ID", facut: !!smso.sender_id.trim() },
          { text: "SMSO activ", facut: configurat && !!initialConfig.enabled },
        ]} />
        <CardCifre titlu="Dezabonați de la marketing" cifre={[{ eticheta: "numere care nu mai primesc campanii", valoare: dezabonatiTotal }]} />
        <CumFunctioneaza id="smso" puncte={[
          { Icon: UserPlus, text: "Îți faci cont pe smso.ro. La înregistrare primești credit de test, ca să probezi integrarea." },
          { Icon: KeyRound, text: "Cheia API o iei din SMSO: Setări, Dezvoltatori, API. Sender ID e numărul din dreptul senderului, la Sendere." },
          { Icon: Megaphone, text: "Cu SMSO pornit apare SMS Marketing în meniu, de unde trimiți campanii." },
          { Icon: MessageSquare, text: "Fiecare SMS consumă credit din contul tău SMSO." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Contul SMSO" descriere="Cheia API și senderul de pe care pleacă mesajele.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cheie API SMSO" htmlFor="smso-cheie"
            ajutor={<ExplicatieCard marime="mic" intrebare="De unde o iau" eticheta="Cheia API SMSO"
              text="În contul SMSO: Setări, apoi Dezvoltatori, apoi API. Copiezi cheia generată." />}>
            <Input
              id="smso-cheie"
              type="password"
              value={smso.api_key}
              onChange={e => setSmso(s => ({ ...s, api_key: e.target.value }))}
              placeholder={cheieSalvata ? PLACEHOLDER_SECRET_SALVAT : "Cheia ta API de la app.smso.ro"}
            />
          </Field>
          <Field label="Sender ID" htmlFor="smso-sender" hint="ID-ul numeric afișat în secțiunea Sendere a contului tău SMSO.">
            <Input
              id="smso-sender"
              type="text"
              value={smso.sender_id}
              onChange={e => setSmso(s => ({ ...s, sender_id: e.target.value }))}
              placeholder="ex: 4"
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <a href="https://app.smso.ro/developers/api" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
            Cheia API în SMSO <ExternalLink className="h-3 w-3" />
          </a>
          <a href="https://app.smso.ro/senders" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
            Senderele în SMSO <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </Sectiune>

      <Sectiune pas={2} titlu="Mesaje automate" descriere="SMS-uri care pleacă singure, fără să apeși nimic.">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">SMS automat la schimbarea statusului</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Clientul primește un SMS când îi schimbi statusul comenzii (de exemplu Expediat). Consumă credit SMSO la fiecare schimbare.
            </p>
          </div>
          <Switch
            checked={smso.notify_status_change && smso.enabled}
            onCheckedChange={v => setSmso(s => ({ ...s, notify_status_change: v }))}
            disabled={!smso.enabled}
            aria-label="SMS automat la schimbarea statusului"
          />
        </div>
        {!smso.enabled && (
          <p className="text-xs text-muted-foreground">Se poate porni după ce pornești comutatorul „SMS prin SMSO” de sus.</p>
        )}
      </Sectiune>

      {arataTestul && (
        <Sectiune pas={3} titlu="Testează integrarea" descriere="Trimite un SMS de test, ca să verifici că cheia API și Sender ID sunt corecte. Consumă credit SMSO.">
          {testResult && (
            <Callout variant={testResult.ok ? "success" : "danger"} icon={testResult.ok ? CheckCircle : XCircle} title={testResult.message}>
              {testResult.details && <span className="font-mono text-xs">{testResult.details}</span>}
            </Callout>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex flex-1 overflow-hidden rounded-lg border border-input transition-colors focus-within:border-ring">
              <span className="flex w-10 shrink-0 items-center justify-center bg-muted/40">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
              <input
                type="tel"
                aria-label="Numărul de telefon pentru test"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                placeholder="07XXXXXXXX sau +407XXXXXXXX"
                className="flex-1 bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
            <Button variant="outline" onClick={sendTest} disabled={testLoading} className="whitespace-nowrap">
              {testLoading ? <Loader2 className="animate-spin" /> : <MessageSquare />}
              {testLoading ? "Se trimite..." : "Trimite test"}
            </Button>
          </div>
        </Sectiune>
      )}

      <Sectiune pas={arataTestul ? 4 : 3} titlu="Rapoarte de livrare și răspunsuri"
        descriere="Nu ai nimic de configurat: adresa de mai jos pleacă automat cu fiecare SMS.">
        <p className="text-xs leading-relaxed text-muted-foreground">
          SMSO ne răspunde pe ea când mesajul ajunge la telefon sau când cineva răspunde{" "}
          <span className="font-semibold">STOP</span>. O poți lipi și în contul SMSO, la setările de webhook,
          dacă vrei rapoarte și pentru mesajele trimise de acolo.
        </p>
        {webhookUrl ? (
          <div className="flex gap-2">
            <code className="flex-1 truncate rounded-lg border border-input bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
              {webhookUrl}
            </code>
            <Button variant="outline" onClick={() => copiazaAdresa(webhookUrl)}>
              <Copy /> Copiază
            </Button>
          </div>
        ) : (
          <Callout variant="danger" title="Adresa nu poate fi compusă acum">
            Rapoartele de livrare nu vor ajunge la noi, dar SMS-urile pleacă în continuare. Scrie-ne ca să ne uităm.
          </Callout>
        )}

        <div className="border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <BellOff className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">
              Dezabonați de la marketing ({dezabonatiTotal})
            </p>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Numerele care au răspuns STOP sau pe care SMSO le-a marcat ca dezabonate nu mai primesc campanii și nici
            mesaje de coș abandonat. Mesajele despre comenzile lor pleacă în continuare: le-au plătit, au dreptul să le
            afle starea.
          </p>
          {dezabonatiTotal > dezabonati.length && (
            /* ⚠ Cifra din antet e a tuturor; lista de dedesubt e doar inceputul ei. Spus
               pe fata, fiindca o lista scurtata in tacere il face pe comerciant sa creada
               ca i-a numarat pe toti. */
            <p className="mt-2 text-xs text-muted-foreground">
              Mai jos sunt cele mai noi {dezabonati.length} numere din {dezabonatiTotal}.
            </p>
          )}
          {dezabonati.length > 0 && (
            <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto">
              {dezabonati.map(d => (
                <li
                  key={d.phone}
                  className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-1.5 text-xs"
                >
                  <span className="font-mono text-foreground">{d.phone}</span>
                  <span className="text-muted-foreground">
                    {d.sursa === "raspuns_stop" ? "a răspuns STOP" : "marcat de SMSO"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sectiune>

      <BaraSalvare modificat={modificat} saving={saving} onSalveaza={save} onRenunta={renunta} />
    </PaginaIntegrare>
  );
}
