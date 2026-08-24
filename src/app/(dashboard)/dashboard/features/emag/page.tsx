import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import { EmagClient } from "@/components/dashboard/EmagClient";
import { EmagCategoryMapping } from "@/components/dashboard/EmagCategoryMapping";
import { EmagListings } from "@/components/dashboard/EmagListings";
import { EmagProbleme } from "@/components/dashboard/EmagProbleme";
import { EmagDePublicat } from "@/components/dashboard/EmagDePublicat";
import { EmagReturns } from "@/components/dashboard/EmagReturns";
import { EmagCampanii } from "@/components/dashboard/EmagCampanii";
import { EmagJurnal } from "@/components/dashboard/EmagJurnal";
import { EmagFacturiLor } from "@/components/dashboard/EmagFacturiLor";
import { getEmagStatus } from "@/lib/actions/emag.actions";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * eMAG Marketplace.
 *
 * Antetul pleaca imediat, starea curge dupa el — aceeasi forma ca la About You, si
 * din acelasi motiv: `getEmagStatus` face cinci numaratori in baza, iar antetul
 * (link de intoarcere, sigla, descriere) nu depinde de niciuna.
 *
 * ⚠ La eMAG mai e un motiv, care nu exista la celelalte: pagina asta poarta
 * PRERECHIZITUL DE IP. Comerciantul trebuie sa vada adresa de albit inainte sa
 * incerce ceva, iar daca antetul ar astepta starea, primul lucru pe care il vede
 * ar fi un ecran gol.
 */
export default async function EmagPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("user_id", user.id).eq("type", "ministore").limit(1).single();
  if (!biz) redirect("/dashboard");

  return (
    <div className="p-6 max-w-4xl">
      <IntegrationHeader
        id="emag"
        description="Vinde pe eMAG direct din Edinio: publici produsele, primești comenzile și trimiți facturile, fără să mai intri în panoul lor."
      />
      <Suspense fallback={<ScheletEmag />}>
        <ContinutEmag businessId={biz.id} />
      </Suspense>
    </div>
  );
}

function ScheletEmag() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

async function ContinutEmag({ businessId }: { businessId: string }) {
  const stare = await getEmagStatus(businessId);
  const conectat = !("error" in stare) && stare.connected && !stare.needsReconnect;

  return (
    <div className="space-y-4">
      <EmagClient businessId={businessId} status={"error" in stare ? null : stare} />

      {/*
        ⚠ MAPAREA SI LISTA APAR NUMAI DUPA CONECTARE, si nu din cochetarie.
        Amandoua cer nomenclatoarele de la eMAG la prima randare: fara acreditari,
        fiecare deschidere a paginii ar fi pornit apeluri care se intorc cu 401, iar
        comerciantul ar fi vazut doua ecrane care se invart si o eroare care nu are
        nicio legatura cu ce trebuie el sa faca — adica sa se conecteze.

        ⚠ `needsReconnect` conteaza si el: cu acreditari respinse, ecranele ar arata
        liste goale, iar golul e cea mai proasta explicatie posibila. Cardul de
        deasupra spune deja limpede ca trebuie reconectat contul.
      */}
      {conectat && (
        <>
          <EmagCategoryMapping businessId={businessId} />
          {/* ⚠ DEASUPRA listei, si se ascunde singur cand nu e nimic. Rostul lui e sa
              scuteasca citirea listei rand cu rand — pus DEDESUBT, ar fi fost gasit
              abia dupa ce omul face chiar lucrul pe care centrul il inlocuieste. */}
          <EmagProbleme businessId={businessId} />
          {/* ⚠ INAINTEA listei de oferte, si se ascunde singur cand tot catalogul e
              publicat. Cine intra prima data are catalogul intreg aici, iar lista de
              oferte goala — deci asta e cartea care trebuie sa-i sara in ochi. */}
          <EmagDePublicat businessId={businessId} />
          <EmagListings businessId={businessId} />
          {/* Se ascunde singur cand nu e niciun retur: o carte goala nu spune nimic. */}
          <EmagReturns businessId={businessId} />
          <EmagCampanii businessId={businessId} />
          <EmagFacturiLor businessId={businessId} />
          {/* ⚠ Ultimul, si inchis. Nu e un ecran de zi cu zi — se deschide cand ceva
              pare ca n-a plecat. Pus mai sus, ar fi impins jos lucrurile pe care
              comerciantul chiar le face in fiecare zi. */}
          <EmagJurnal businessId={businessId} />
        </>
      )}
    </div>
  );
}
