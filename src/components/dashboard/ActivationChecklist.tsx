"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Check, ChevronDown, ChevronUp, Rocket, Copy, ArrowRight, PartyPopper, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { EDITOR_VISITED_KEY } from "@/lib/activation";

export interface ChecklistStep {
  id: string;
  title: string;
  description: string;
  done: boolean;
  /** Link de navigare pentru pasul respectiv. */
  href?: string;
  /** Daca e true, actiunea copiaza link-ul public al magazinului. */
  share?: boolean;
  cta: string;
}

interface Props {
  steps: ChecklistStep[];
  plan: string;
  planExpiresAt: string | null;
  publicUrl: string;
}

const STORAGE_KEY = "edinio_activation_collapsed";

// Stare "restrans/extins" persistata in localStorage, citita printr-un external
// store (fara setState-in-effect, sigur la hidratare: server = extins).
const collapseListeners = new Set<() => void>();

function readCollapsed(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}

function subscribeCollapsed(cb: () => void): () => void {
  collapseListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => { collapseListeners.delete(cb); window.removeEventListener("storage", cb); };
}

function setStoredCollapsed(v: boolean): void {
  try { localStorage.setItem(STORAGE_KEY, v ? "1" : "0"); } catch { /* ignore */ }
  collapseListeners.forEach((l) => l());
}

// Pasul "Personalizeaza magazinul" se bifeaza cand utilizatorul a ajuns pe pagina
// "Editeaza magazinul" (marcata acolo de <MarkEditorVisited/>), nu doar cand a
// incarcat un logo. Flag persistat local, citit hidratare-safe (server = false).
function readEditorVisited(): boolean {
  try { return localStorage.getItem(EDITOR_VISITED_KEY) === "1"; } catch { return false; }
}

function subscribeStorage(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

export function ActivationChecklist({ steps, plan, planExpiresAt, publicUrl }: Props) {
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const editorVisited = useSyncExternalStore(subscribeStorage, readEditorVisited, () => false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Link-ul magazinului a fost copiat!");
    } catch {
      toast.error("Nu am putut copia link-ul. Copiaza-l manual din bara de sus.");
    }
  }

  // Pasul "customize" e bifat si daca utilizatorul a vizitat pagina de editare.
  const effectiveSteps = editorVisited
    ? steps.map((s) => (s.id === "customize" ? { ...s, done: true } : s))
    : steps;

  const total = effectiveSteps.length;
  const doneCount = effectiveSteps.filter((s) => s.done).length;
  const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const allDone = doneCount === total;
  const isTrial = plan === "free" || plan === "trial";
  const firstOpenIndex = effectiveSteps.findIndex((s) => !s.done);

  // Magazin complet configurat pe plan platit → nu mai aratam nimic.
  if (allDone && !isTrial) return null;

  // Magazin complet configurat pe trial → nudge de upgrade (pastreaza magazinul online).
  if (allDone && isTrial) {
    const expiresLabel = planExpiresAt
      ? new Date(planExpiresAt).toLocaleDateString("ro-RO", { day: "numeric", month: "long" })
      : null;
    return (
      <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 overflow-hidden">
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
              <PartyPopper className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">Felicitari, magazinul tau e complet configurat!</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {expiresLabel
                  ? <>Alege un plan ca sa ramai online dupa {expiresLabel}. Anulezi oricand, pretul ramane fix pe viata.</>
                  : <>Alege un plan ca sa deblochezi tot potentialul magazinului. Anulezi oricand, pretul ramane fix pe viata.</>}
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/settings#abonament"
            className="flex-shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Zap className="h-4 w-4" />
            Alege un plan
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 py-4 flex items-center gap-3 border-b border-border">
        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
          <Rocket className="h-[18px] w-[18px]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-foreground truncate">Configureaza-ti magazinul</p>
            <span className="text-xs font-semibold text-muted-foreground tabular-nums flex-shrink-0">
              {doneCount}/{total}
            </span>
          </div>
          {/* Bara de progres */}
          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setStoredCollapsed(!collapsed)}
          aria-label={collapsed ? "Extinde" : "Restrange"}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
        >
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>

      {/* Pasi */}
      {!collapsed && (
        <ul className="divide-y divide-border">
          {effectiveSteps.map((step, i) => {
            const isNext = !step.done && i === firstOpenIndex;
            return (
              <li
                key={step.id}
                className={cn(
                  "flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-5 py-3.5 transition-colors",
                  isNext && "bg-primary/[0.03]"
                )}
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* Indicator */}
                  <div
                    className={cn(
                      "mt-0.5 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold",
                      step.done
                        ? "bg-primary text-white"
                        : isNext
                          ? "border-2 border-primary text-primary"
                          : "border-2 border-border text-muted-foreground"
                    )}
                  >
                    {step.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                  </div>
                  {/* Text */}
                  <div className="min-w-0">
                    <p className={cn(
                      "text-sm font-semibold",
                      step.done ? "text-muted-foreground line-through decoration-muted-foreground/40" : "text-foreground"
                    )}>
                      {step.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.description}</p>
                  </div>
                </div>

                {/* Actiune */}
                <div className="pl-9 sm:pl-0 sm:flex-shrink-0">
                  {step.done ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                      <Check className="h-3.5 w-3.5" /> Gata
                    </span>
                  ) : step.share ? (
                    <button
                      type="button"
                      onClick={copyLink}
                      className={cn(
                        "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors w-full sm:w-auto",
                        isNext ? "bg-primary text-white hover:bg-primary/90" : "border border-border text-foreground hover:bg-muted"
                      )}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {step.cta}
                    </button>
                  ) : (
                    <Link
                      href={step.href ?? "/dashboard"}
                      className={cn(
                        "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors w-full sm:w-auto",
                        isNext ? "bg-primary text-white hover:bg-primary/90" : "border border-border text-foreground hover:bg-muted"
                      )}
                    >
                      {step.cta}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
