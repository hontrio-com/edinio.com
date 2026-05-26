"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Save, Loader2, MessageSquare, Phone,
  ExternalLink, CheckCircle, XCircle,
} from "lucide-react";
import { updateSmsoConfig } from "@/lib/actions/store.actions";
import type { SmsoConfig } from "@/lib/smso";

const inputCls = "w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

export function SmsoConfigClient({ businessId, initialConfig }: { businessId: string; initialConfig: SmsoConfig }) {
  const router = useRouter();
  const [smso, setSmso] = useState<SmsoConfig>(initialConfig);
  const [saving, startSave] = useTransition();
  const [testLoading, setTestLoading] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; details?: string } | null>(null);

  function save() {
    if (smso.enabled && !smso.api_key.trim()) { toast.error("Cheia API este obligatorie."); return; }
    if (smso.enabled && !smso.sender_id.trim()) { toast.error("Sender ID este obligatoriu."); return; }
    startSave(async () => {
      const result = await updateSmsoConfig(businessId, smso);
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
        body: JSON.stringify({ api_key: smso.api_key, sender_id: smso.sender_id, phone: testPhone }),
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
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.push("/dashboard/features")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Integrari
        </button>
        <span className="text-muted-foreground">/</span>
        <div className="flex items-center gap-2">
          <img src="/integrations/smso.svg" alt="SMSO" className="h-5 w-auto object-contain" style={{ transform: "scale(1.3)", transformOrigin: "center" }} />
          <span className="text-sm font-semibold text-foreground">Smso.ro</span>
        </div>
        {smso.enabled && (
          <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
            <CheckCircle className="h-2.5 w-2.5" />Activ
          </span>
        )}
      </div>

      <div className="space-y-6">
        {/* Info */}
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
          <MessageSquare className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Integreaza contul tau SMSO pentru a trimite campanii SMS catre clientii magazinului.
            Dupa activare, sectiunea <strong>SMS Marketing</strong> va aparea in meniu.
          </p>
        </div>

        {/* Ghid pas cu pas */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <p className="text-sm font-semibold text-foreground">Cum obtii Cheia API si Sender ID?</p>
          </div>
          <div className="px-5 py-4 space-y-4">
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
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary">{step}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                  {link && (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                    >
                      Deschide in SMSO <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Configurare */}
        <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
          {/* Toggle activare */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Activeaza SMSO</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Activeaza pentru a putea trimite campanii SMS Marketing din dashboard
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSmso(s => ({ ...s, enabled: !s.enabled }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${smso.enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${smso.enabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>

          {/* Campuri */}
          <div className="space-y-4 pt-4 border-t border-border">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Cheie API SMSO</label>
              <input
                type="password"
                value={smso.api_key}
                onChange={e => setSmso(s => ({ ...s, api_key: e.target.value }))}
                placeholder="Cheia ta API de la app.smso.ro"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Sender ID</label>
              <input
                type="text"
                value={smso.sender_id}
                onChange={e => setSmso(s => ({ ...s, sender_id: e.target.value }))}
                placeholder="ID-ul numeric al senderului (ex: 4)"
                className={inputCls}
              />
              <p className="text-xs text-muted-foreground mt-1">
                ID-ul numeric afisat in sectiunea Sendere a contului tau SMSO.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Se salveaza..." : "Salveaza integrarea"}
            </button>
          </div>
        </div>

        {/* Test SMS */}
        {smso.api_key && smso.sender_id && (
          <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Testeaza integrarea</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Trimite un SMS de test ca sa verifici ca Cheia API si Sender ID sunt corecte
              </p>
            </div>

            {testResult && (
              <div className={`rounded-lg p-3 text-sm space-y-1 ${testResult.ok ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
                <div className="flex items-center gap-2">
                  {testResult.ok
                    ? <CheckCircle className="h-4 w-4 flex-shrink-0" />
                    : <XCircle className="h-4 w-4 flex-shrink-0" />}
                  <p className="font-semibold">{testResult.message}</p>
                </div>
                {testResult.details && <p className="text-xs opacity-80 font-mono pl-6">{testResult.details}</p>}
              </div>
            )}

            <div className="flex gap-2">
              <div className="flex flex-1 overflow-hidden rounded-lg border border-border focus-within:border-primary transition-colors">
                <span className="flex items-center justify-center w-10 shrink-0 bg-muted/40">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                <input
                  type="tel"
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                  placeholder="07XXXXXXXX sau +407XXXXXXXX"
                  className="flex-1 px-3 py-2.5 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={sendTest}
                disabled={testLoading}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-border bg-muted/40 hover:bg-muted transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {testLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                {testLoading ? "Se trimite..." : "Trimite test"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
