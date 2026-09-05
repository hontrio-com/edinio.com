import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { listeazaConfiguratoare } from "@/lib/actions/configurator.actions";
import { ConfiguratoareClient } from "@/components/dashboard/ConfiguratoareClient";
import { Skeleton, SkeletonRanduri } from "@/components/ui/skeleton";

/**
 * Cadrul pleaca imediat; lista curge dupa el.
 *
 * Aceeasi asezare ca la Pachete: verificarea de autentificare e ieftina si se face sus, iar
 * citirea — care numara si produsele si categoriile legate — sta sub `Suspense`, ca omul sa vada
 * pagina inainte ca baza sa raspunda.
 */

export const metadata: Metadata = { title: "Configuratoare" };

export default async function PaginaConfiguratoare() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  return (
    <div className="p-6">
      <Suspense fallback={<Schelet />}>
        <Lista />
      </Suspense>
    </div>
  );
}

function Schelet() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-11 w-44 shrink-0" />
      </div>
      <Skeleton className="h-11" />
      <SkeletonRanduri randuri={4} inaltime="h-14" />
    </div>
  );
}

async function Lista() {
  const r = await listeazaConfiguratoare();

  /*
   * ⚠ O eroare NU se randeaza ca lista goala.
   *
   * „Zero configuratoare" si „n-am putut citi" arata la fel pe ecran, dar inseamna lucruri
   * opuse: primul il invita pe om sa creeze, al doilea l-ar face sa creada ca si-a pierdut
   * munca. Chiar mesajul care a aparut pe toate cele 127 de magazine pe 03.09.2026.
   */
  if ("error" in r) {
    return (
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground">Configuratoare</h1>
        <p className="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {r.error}
        </p>
      </div>
    );
  }

  return <ConfiguratoareClient randuri={r.randuri} />;
}
