"use client";

import { ExternalLink, Copy, AlertTriangle, Check, Globe, Loader2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { updateBusiness } from "@/lib/actions/business.actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/**
 * Bara de stare din capul panoului.
 *
 * Pana acum spunea „Publicat" cu bulina verde si dadea „Copiaza link" pentru
 * adresa construita din `custom_domain`, fara sa se uite vreodata daca domeniul
 * acela raspunde. La un domeniu mort iti dadea un link mort si iti spunea ca e
 * totul in regula. `custom_domain_healthy` vine acum din baza (`false` inseamna
 * DOVEDIT mort, `null` inseamna doar „inca neverificat") si:
 *   - pe `false` nu se mai da verde si nu se mai ofera linkul care nu merge;
 *   - se ofera in loc adresa de platforma, care functioneaza intre timp.
 */
export function SiteStatusBar({
  isPublished,
  businessId,
  publicUrl,
  platformUrl,
  customDomain,
  domainHealthy,
}: {
  isPublished: boolean;
  businessId: string;
  publicUrl: string;
  /** Adresa pe edinio.com/<slug>. Merge si cand domeniul propriu e cazut. */
  platformUrl: string;
  customDomain: string | null;
  /** `null` = neverificat. Doar `false` e dovada ca domeniul nu raspunde. */
  domainHealthy: boolean | null;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const domeniuCazut = !!customDomain && domainHealthy === false;
  // Cand domeniul propriu e dovedit mort, tot ce oferim aici (link, copiere,
  // butonul de vizualizare) trebuie sa duca la adresa care chiar functioneaza.
  const linkUtil = domeniuCazut ? platformUrl : publicUrl;
  const displayUrl = linkUtil.replace(/^https?:\/\//, "").replace(/^www\./, "");

  function handleCopy() {
    navigator.clipboard.writeText(linkUtil).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handlePublish() {
    setPublishing(true);
    const result = await updateBusiness(businessId, { is_published: true });
    setPublishing(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setShowConfirm(false);
    toast.success("Magazinul a fost publicat! Este vizibil public.");
    router.refresh();
  }

  if (!isPublished) {
    return (
      <>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-5 py-4 bg-warning/5 border border-warning/20 rounded-xl">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
            <span className="text-sm text-warning font-medium">
              Site-ul tau nu este publicat. Clientii nu il pot vedea.
            </span>
          </div>
          <Button size="sm" onClick={() => setShowConfirm(true)} className="shrink-0 bg-warning text-white hover:bg-warning/90">
            Publica acum
          </Button>
        </div>

        {showConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
            onClick={() => { if (!publishing) setShowConfirm(false); }}
          >
            <div
              className="w-full max-w-sm bg-card rounded-2xl border border-border shadow-xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">Publici magazinul?</h3>
              <p className="text-sm text-muted-foreground mb-5">
                <span className="font-medium text-foreground">{displayUrl}</span> va deveni vizibil public si clientii vor putea plasa comenzi. Poti opri publicarea oricand din editor.
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" disabled={publishing} onClick={() => setShowConfirm(false)}>
                  Anuleaza
                </Button>
                <Button type="button" disabled={publishing} onClick={handlePublish}>
                  {publishing ? <Loader2 className="animate-spin" /> : <Globe />}
                  Publica magazinul
                </Button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className={cn(
        "px-5 py-4 border rounded-xl",
        domeniuCazut
          ? "bg-destructive/5 border-destructive/20 space-y-3"
          : "bg-surface border-border"
      )}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {domeniuCazut ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20 flex-shrink-0">
              <AlertTriangle className="h-3 w-3" />
              Domeniu cazut
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-success/10 text-success border border-success/20 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              Publicat
            </span>
          )}
          <a
            href={linkUtil}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline font-mono truncate max-w-xs"
          >
            {displayUrl}
          </a>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors text-foreground"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copiat!" : "Copiaza link"}
          </button>
          <a
            href={linkUtil}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Vizualizeaza
          </a>
        </div>
      </div>

      {domeniuCazut && (
        <p className="text-xs text-destructive leading-relaxed">
          Domeniul <span className="font-mono font-semibold">{customDomain}</span> nu raspunde, deci
          clientii care il tasteaza nu ajung nicaieri. Magazinul e in continuare accesibil pe adresa
          de mai sus.{" "}
          <Link href="/dashboard/settings" className="font-semibold underline hover:no-underline">
            Deschide Setari, sectiunea Domeniu
          </Link>{" "}
          ca sa vezi ce e de reparat.
        </p>
      )}
    </div>
  );
}
