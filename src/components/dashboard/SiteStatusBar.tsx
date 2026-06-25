"use client";

import { ExternalLink, Copy, AlertTriangle, Check, Globe, Loader2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateBusiness } from "@/lib/actions/business.actions";
import { Button } from "@/components/ui/button";

export function SiteStatusBar({
  isPublished,
  businessId,
  publicUrl,
}: {
  isPublished: boolean;
  businessId: string;
  publicUrl: string;
}) {
  const router = useRouter();
  // Public identity to show: custom domain if connected, else edinio.com/slug.
  const displayUrl = publicUrl.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const [copied, setCopied] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [publishing, setPublishing] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(publicUrl).then(() => {
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
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-5 py-4 bg-surface border border-border rounded-xl">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-success/10 text-success border border-success/20">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          Publicat
        </span>
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline font-mono truncate max-w-xs"
        >
          {publicUrl.replace("http://", "").replace("https://", "")}
        </a>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copiat!" : "Copiaza link"}
        </button>
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Vizualizeaza
        </a>
      </div>
    </div>
  );
}
