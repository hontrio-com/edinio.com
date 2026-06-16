"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Mail, MessageSquare, Loader2, Save, Clock, Sparkles, Zap, AlertTriangle } from "lucide-react";
import { saveAbandonedCartAutomation } from "@/lib/actions/abandoned-cart.actions";
import type { AbandonedCartsData, AbandonedAutomationStep } from "@/lib/abandoned-cart";

const inputCls = "w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

function uid() { return Math.random().toString(36).slice(2, 10); }

const RECOMMENDED: Omit<AbandonedAutomationStep, "id">[] = [
  { delay_hours: 1, channel: "email" },
  { delay_hours: 24, channel: "email", discount_code: "" },
  { delay_hours: 48, channel: "sms" },
];

export function AbandonedAutomationsTab({ businessId, data }: { businessId: string; data: AbandonedCartsData }) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const a = data.automation;

  const [enabled, setEnabled] = useState(a.enabled);
  const [minCart, setMinCart] = useState(a.min_cart_value != null ? String(a.min_cart_value) : "");
  const [quietOn, setQuietOn] = useState(!!a.quiet_hours);
  const [quietStart, setQuietStart] = useState(String(a.quiet_hours?.start ?? 22));
  const [quietEnd, setQuietEnd] = useState(String(a.quiet_hours?.end ?? 8));
  const [steps, setSteps] = useState<AbandonedAutomationStep[]>(a.steps);

  function addStep(seed?: Omit<AbandonedAutomationStep, "id">) {
    setSteps((p) => [...p, { id: uid(), delay_hours: seed?.delay_hours ?? 24, channel: seed?.channel ?? "email", message: seed?.message, discount_code: seed?.discount_code }]);
  }
  function seedRecommended() { setSteps(RECOMMENDED.map((s) => ({ id: uid(), ...s }))); }
  function updateStep(id: string, patch: Partial<AbandonedAutomationStep>) {
    setSteps((p) => p.map((s) => s.id === id ? { ...s, ...patch } : s));
  }
  function removeStep(id: string) { setSteps((p) => p.filter((s) => s.id !== id)); }

  function save() {
    startSave(async () => {
      const res = await saveAbandonedCartAutomation(businessId, {
        enabled,
        min_cart_value: minCart.trim() ? Number(minCart) : null,
        quiet_hours: quietOn ? { start: Number(quietStart) || 0, end: Number(quietEnd) || 0 } : null,
        steps: steps.map((s) => ({
          id: s.id,
          delay_hours: Number(s.delay_hours) || 0,
          channel: s.channel,
          message: s.message?.trim() || undefined,
          discount_code: s.discount_code?.trim() || undefined,
        })),
      });
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Automatizarea a fost salvată.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Zap className="h-5 w-5" /> Automatizări</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Trimite automat mesaje de recuperare, programat, fără să fii nevoit să le trimiți manual.</p>
      </div>

      {/* Master toggle */}
      <label className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 cursor-pointer">
        <div>
          <p className="text-sm font-semibold text-foreground">Activează automatizările</p>
          <p className="text-xs text-muted-foreground mt-0.5">Când e oprit, recuperarea rămâne doar manuală.</p>
        </div>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-5 h-5 accent-[var(--primary)] shrink-0" />
      </label>

      {/* Steps */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Secvența de mesaje</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Fiecare pas se trimite după un timp de la abandonare.</p>
          </div>
          {steps.length === 0 && (
            <button onClick={seedRecommended} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:opacity-80">
              <Sparkles className="h-3.5 w-3.5" /> Folosește secvența recomandată
            </button>
          )}
        </div>

        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-xl">
            Niciun pas. Adaugă unul sau folosește secvența recomandată (1h email, 24h email + reducere, 48h SMS).
          </p>
        ) : (
          <div className="space-y-3">
            {steps.map((s, i) => (
              <div key={s.id} className="rounded-xl border border-border p-3 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <span className="text-sm text-muted-foreground">După</span>
                  <input type="number" min="0" step="1" value={s.delay_hours}
                    onChange={(e) => updateStep(s.id, { delay_hours: Number(e.target.value) })}
                    className={`${inputCls} w-20`} />
                  <span className="text-sm text-muted-foreground">ore</span>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <button onClick={() => updateStep(s.id, { channel: "email" })}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${s.channel === "email" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                      <Mail className="h-3.5 w-3.5" /> Email
                    </button>
                    <button onClick={() => updateStep(s.id, { channel: "sms" })}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${s.channel === "sms" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                      <MessageSquare className="h-3.5 w-3.5" /> SMS
                    </button>
                    <button onClick={() => removeStep(s.id)} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {s.channel === "sms" && !data.smsoEnabled && (
                  <p className="text-[11px] text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> SMSO nu e activat — acest pas nu se va trimite până nu activezi integrarea SMSO.</p>
                )}

                <div className="grid sm:grid-cols-2 gap-2">
                  <textarea value={s.message ?? ""} onChange={(e) => updateStep(s.id, { message: e.target.value })}
                    rows={2} placeholder="Mesaj (opțional). Lasă gol pentru textul standard." className={`${inputCls} resize-none`} />
                  <input value={s.discount_code ?? ""} onChange={(e) => updateStep(s.id, { discount_code: e.target.value.toUpperCase() })}
                    placeholder="Cod reducere (opțional)" className={`${inputCls} uppercase h-fit`} />
                </div>
              </div>
            ))}
          </div>
        )}

        <button onClick={() => addStep()} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:opacity-80">
          <Plus className="h-4 w-4" /> Adaugă pas
        </button>
      </div>

      {/* Rules */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Reguli</h3>

        <div>
          <label className="block text-sm text-foreground mb-1.5">Valoare minimă coș (opțional)</label>
          <div className="flex items-center gap-2">
            <input type="number" min="0" step="1" value={minCart} onChange={(e) => setMinCart(e.target.value)} placeholder="ex: 50" className={`${inputCls} w-40`} />
            <span className="text-sm text-muted-foreground">lei</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Nu trimite pentru coșuri sub această valoare (economisești credit SMS).</p>
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer mb-2">
            <input type="checkbox" checked={quietOn} onChange={(e) => setQuietOn(e.target.checked)} className="w-4 h-4 accent-[var(--primary)]" />
            <span className="text-sm text-foreground flex items-center gap-1.5"><Clock className="h-4 w-4" /> Ore liniștite (fără SMS)</span>
          </label>
          {quietOn && (
            <div className="flex items-center gap-2 pl-6">
              <span className="text-sm text-muted-foreground">de la</span>
              <input type="number" min="0" max="23" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} className={`${inputCls} w-20`} />
              <span className="text-sm text-muted-foreground">până la</span>
              <input type="number" min="0" max="23" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} className={`${inputCls} w-20`} />
              <span className="text-sm text-muted-foreground">(ora României)</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg transition-all hover:opacity-90 disabled:opacity-60">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Se salvează...</> : <><Save className="h-4 w-4" /> Salvează automatizarea</>}
        </button>
      </div>
    </div>
  );
}
