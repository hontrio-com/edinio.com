"use client";

import { ShieldAlert } from "lucide-react";
import { logout } from "@/lib/actions/auth.actions";

/**
 * Bara care arata ca sesiunea curenta e IMPRUMUTATA prin impersonare din panoul
 * de administrare. Fara ea, un administrator putea ramane ore intregi conectat
 * ca alt utilizator fara sa observe si sa faca modificari in numele lui.
 */
export function ImpersonationBanner() {
  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-2 text-center text-xs font-semibold text-amber-950">
      <span className="flex items-center gap-1.5">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
        Esti conectat ca acest utilizator, prin impersonare din panoul de administrare.
      </span>
      <form action={logout}>
        <button
          type="submit"
          className="rounded-full bg-amber-950/15 px-3 py-0.5 underline underline-offset-2 transition hover:bg-amber-950/25"
        >
          Iesi din impersonare
        </button>
      </form>
    </div>
  );
}
