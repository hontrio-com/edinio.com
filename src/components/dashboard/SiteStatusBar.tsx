"use client";

import { ExternalLink, Copy, AlertTriangle, Check, Globe, Loader2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateBusiness } from "@/lib/actions/business.actions";

export function SiteStatusBar({
  isPublished,
  businessId,
  businessName,
  publicUrl,
}: {
  isPublished: boolean;
  businessId: string;
  businessName: string;
  publicUrl: string;
}) {
  const router = useRouter();
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-5 py-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <span className="text-sm text-amber-800 font-medium">
              Site-ul tau nu este publicat. Clientii nu il pot vedea.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="flex-shrink-0 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
          >
            Publica acum
          </button>
        </div>

        {showConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
            onClick={() => { if (!publishing) setShowConfirm(false); }}
          >
            <div
              className="w-full max-w-sm bg-surface rounded-2xl border border-border shadow-xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">Publici magazinul?</h3>
              <p className="text-sm text-muted-foreground mb-5">
                <span className="font-medium text-foreground">{businessName}</span> va deveni vizibil public si clientii vor putea plasa comenzi. Poti opri publicarea oricand din editor.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={publishing}
                  onClick={() => setShowConfirm(false)}
                  className="px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Anuleaza
                </button>
                <button
                  type="button"
                  disabled={publishing}
                  onClick={handlePublish}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl transition-colors disabled:opacity-50"
                >
                  {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                  Publica magazinul
                </button>
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
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
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
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
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
