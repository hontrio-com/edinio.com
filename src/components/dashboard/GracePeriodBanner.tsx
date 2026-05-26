"use client";

import { AlertTriangle, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";

interface Props {
  suspendedUntil: string; // ISO string
}

export function GracePeriodBanner({ suspendedUntil }: Props) {
  const router = useRouter();
  const graceDate = new Date(suspendedUntil);
  const now = new Date();
  const isSuspended = graceDate < now;
  const msLeft = graceDate.getTime() - now.getTime();
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 text-sm font-medium text-white ${
        isSuspended ? "bg-red-600" : daysLeft <= 3 ? "bg-red-500" : "bg-amber-500"
      }`}
    >
      {isSuspended ? (
        <XCircle className="h-4 w-4 flex-shrink-0" />
      ) : (
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      )}
      <p className="flex-1 leading-snug">
        {isSuspended
          ? "Magazinul tau este suspendat si nu mai este vizibil clientilor. Actualizeaza metoda de plata pentru a-l reactiva."
          : daysLeft === 1
            ? "Plata abonamentului a esuat. Magazinul tau va fi suspendat maine daca nu actualizezi metoda de plata."
            : `Plata abonamentului a esuat. Magazinul tau va fi suspendat in ${daysLeft} zile daca nu actualizezi metoda de plata.`}
      </p>
      <button
        type="button"
        onClick={() => router.push("/dashboard/settings")}
        className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold bg-white/20 hover:bg-white/30 rounded-lg transition-colors whitespace-nowrap"
      >
        {isSuspended ? "Reactiveaza acum" : "Actualizeaza plata"}
      </button>
    </div>
  );
}
