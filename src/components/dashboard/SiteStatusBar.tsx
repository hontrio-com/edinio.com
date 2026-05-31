"use client";

import Link from "next/link";
import { ExternalLink, Copy, AlertTriangle, Check } from "lucide-react";
import { useState } from "react";

export function SiteStatusBar({
  isPublished,
  businessName,
  publicUrl,
}: {
  isPublished: boolean;
  businessName: string;
  publicUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!isPublished) {
    return (
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-5 py-4 bg-amber-50 border border-amber-200 rounded-xl">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <span className="text-sm text-amber-800 font-medium">
            Site-ul tau nu este publicat. Clientii nu il pot vedea.
          </span>
        </div>
        <Link
          href="/dashboard/editor#publish"
          className="flex-shrink-0 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
        >
          Publica acum
        </Link>
      </div>
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
