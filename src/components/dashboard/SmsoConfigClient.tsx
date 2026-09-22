"use client";

import { useState, useTransition } from "react";
import { secretulEsteSalvat, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";
import { toast } from "sonner";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { useRouter } from "next/navigation";
import {
  Save, Loader2, MessageSquare, Phone,
  ExternalLink, CheckCircle, XCircle, Copy, BellOff,
} from "lucide-react";
import { updateSmsoConfig } from "@/lib/actions/store.actions";
import type { SmsoConfig } from "@/lib/smso";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";

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
  const [smso, setSmso] = useState<SmsoConfig>(initialConfig);
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
        toast.success("Integrarea SMSO a fost salvata.");
        router.refresh();
      }
    });
  }

  async function sendTest() {
    if (!testPhone.trim()) { toast.error("Introdu un numar de telefon."); return; }
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
        setTestResult({ ok: true, message: `SMS trimis cu succes catre ${data.to}`, details: `Cost: ${data.transaction_cost ?? "-"} | Token: ${data.responseToken}` });
      } else {
        setTestResult({ ok: false, message: data.error ?? "Eroare necunoscuta" });
      }
    } catch (err) {
      setTestResult({ ok: false, message: `Eroare retea: ${String(err)}` });
    } finally {
      setTestLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader id="smso" description="Trimite SMS-uri tranzactionale si de marketing prin Smso.ro." />

      <div className="space-y-6">

        {/* Ghid pas cu pas */}
        <Panel className="overflow-hidden">
          <PanelHeader>
            <PanelTitle>Cum obtii Cheia API si Sender ID?</PanelTitle>
          </PanelHeader>
          <div className="space-y-4 px-5 py-4">
            {[
              {
                step: "1",
                title: "Creeaza un cont SMSO",
                desc: "Mergi pe smso.ro si inregistreaza-te. Primesti credit de test pentru a putea testa integrarea.",
                link: null,
              },
              {
                step: "2",
                title: "Obtine Cheia API",
                desc: "Dupa logare, mergi la Setari > Dezvoltatori > API. Copiaza cheia API generata.",
                link: "https://app.smso.ro/developers/api",
              },
              {
                step: "3",
                title: "Adauga un Sender",
                desc: "Mergi la Sendere in contul SMSO. Adauga un sender (poate fi un numar de telefon sau un nume scurt). Noteaza ID-ul numeric afisat in lista.",
                link: "https://app.smso.ro/senders",
              },
              {
                step: "4",
                title: "Completeaza si salveaza",
                desc: "Introdu Cheia API si Sender ID mai jos, salveaza, apoi trimite un SMS de test.",
                link: null,
              },
            ].map(({ step, title, desc, link }) => (
              <div key={step} className="flex gap-3">
                <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-xs font-bold text-primary">{step}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
                  {link && (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Deschide in SMSO <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Configurare */}
        <Panel className="space-y-5 p-5">
          {/* Toggle activare */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Activeaza SMSO</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Activeaza pentru a putea trimite campanii SMS Marketing din dashboard
              </p>
            </div>
            <Switch checked={smso.enabled} onCheckedChange={v => setSmso(s => ({ ...s, enabled: v }))} />
          </div>

          {/* Campuri */}
          <div className="space-y-4 border-t border-border pt-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Cheie API SMSO</label>
              <Input
                type="password"
                value={smso.api_key}
                onChange={e => setSmso(s => ({ ...s, api_key: e.target.value }))}
                placeholder={secretulEsteSalvat(initialConfig, "api_key") ? PLACEHOLDER_SECRET_SALVAT : ""}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Sender ID</label>
              <Input
                type="text"
                value={smso.sender_id}
                onChange={e => setSmso(s => ({ ...s, sender_id: e.target.value }))}
                placeholder="ID-ul numeric al senderului (ex: 4)"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                ID-ul numeric afisat in sectiunea Sendere a contului tau SMSO.
              </p>
            </div>
          </div>

          {/* SMS automat la schimbarea statusului comenzii */}
          <div className="flex items-center justify-between border-t border-border pt-4">
            <div className="pr-4">
              <p className="text-sm font-semibold text-foreground">SMS automat la schimbarea statusului</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Trimite automat un SMS clientului cand schimbi statusul comenzii (ex. Expediat). Consuma credite SMSO la fiecare schimbare.
              </p>
            </div>
            <Switch
              checked={smso.notify_status_change && smso.enabled}
              onCheckedChange={v => setSmso(s => ({ ...s, notify_status_change: v }))}
              disabled={!smso.enabled}
            />
          </div>

          <div className="flex justify-end pt-1">
            <Button size="lg" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {saving ? "Se salveaza..." : "Salveaza integrarea"}
            </Button>
          </div>
        </Panel>

        {/* Test SMS */}
        {(smso.api_key || secretulEsteSalvat(initialConfig, "api_key")) && smso.sender_id && (
          <Panel className="space-y-4 p-5">
            <div>
              <p className="text-sm font-semibold text-foreground">Testeaza integrarea</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Trimite un SMS de test ca sa verifici ca Cheia API si Sender ID sunt corecte
              </p>
            </div>

            {testResult && (
              <div className={cn(
                "space-y-1 rounded-lg border p-3 text-sm",
                testResult.ok
                  ? "border-success/20 bg-success/5 text-success"
                  : "border-destructive/20 bg-destructive/5 text-destructive"
              )}>
                <div className="flex items-center gap-2">
                  {testResult.ok
                    ? <CheckCircle className="h-4 w-4 flex-shrink-0" />
                    : <XCircle className="h-4 w-4 flex-shrink-0" />}
                  <p className="font-semibold">{testResult.message}</p>
                </div>
                {testResult.details && <p className="pl-6 font-mono text-xs opacity-80">{testResult.details}</p>}
              </div>
            )}

            <div className="flex gap-2">
              <div className="flex flex-1 overflow-hidden rounded-lg border border-input transition-colors focus-within:border-ring">
                <span className="flex w-10 shrink-0 items-center justify-center bg-muted/40">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                <input
                  type="tel"
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
          </Panel>
        )}

        {/* Rapoarte de livrare si raspunsuri */}
        <Panel className="space-y-4 p-5">
          <div>
            <p className="text-sm font-semibold text-foreground">Rapoarte de livrare si raspunsuri</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Nu ai nimic de configurat: adresa de mai jos pleaca automat cu fiecare SMS, iar SMSO ne
              raspunde pe ea cand mesajul ajunge la telefon sau cand cineva raspunde{" "}
              <span className="font-semibold">STOP</span>. O poti lipsi si in contul tau SMSO, la
              setarile de webhook, daca vrei sa primim rapoarte si pentru mesajele trimise de acolo.
            </p>
          </div>

          {webhookUrl ? (
            <div className="flex gap-2">
              <code className="flex-1 truncate rounded-lg border border-input bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
                {webhookUrl}
              </code>
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl)
                    .then(() => toast.success("Adresa a fost copiata."))
                    .catch(() => toast.error("Nu am putut copia adresa. Selecteaz-o si copiaz-o manual."));
                }}
              >
                <Copy /> Copiaza
              </Button>
            </div>
          ) : (
            <p className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
              Adresa nu poate fi compusa acum. Rapoartele de livrare nu vor ajunge la noi, dar
              SMS-urile pleaca in continuare. Scrie-ne ca sa ne uitam.
            </p>
          )}

          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <BellOff className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">
                Dezabonati de la marketing ({dezabonatiTotal})
              </p>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Numerele care au raspuns STOP sau pe care SMSO le-a marcat ca dezabonate. Nu mai
              primesc campanii si nici mesaje de cos abandonat. Mesajele despre comenzile lor pleaca
              in continuare: le-au platit, au dreptul sa le afle starea.
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
                      {d.sursa === "raspuns_stop" ? "a raspuns STOP" : "marcat de SMSO"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
