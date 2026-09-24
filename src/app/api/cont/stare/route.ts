import { NextRequest, NextResponse } from "next/server";
import { magazinulDupaGazda, magazinulEOprit } from "@/lib/cont/magazinul-cererii";
import { poartaContuluiLaComanda } from "@/lib/cont/poarta-comenzii";
import { contacteleMele } from "@/lib/cont/date";
import { profilulContului } from "@/lib/cont/profil";
import type { AdresaProfil } from "@/lib/cont/profil-reguli";

/**
 * Formularul de comanda intreaba, la deschidere: „trebuie sa intru in cont ca sa
 * pot trimite?"
 *
 * ⚠⚠ RASPUNSUL VINE DIN ACEEASI POARTA CARE JUDECA TRIMITEREA
 * (`poartaContuluiLaComanda`), nu dintr-o a doua copie a regulii. Altfel formularul
 * ar fi cerut intrarea si acolo unde serverul lasa comanda sa treaca, de pilda cu
 * plafonul zilnic de coduri epuizat: omul n-ar mai fi primit niciun cod si n-ar fi
 * putut comanda deloc, desi serverul l-ar fi primit ca vizitator.
 *
 * ⚠ Raspunsul e un AJUTOR pentru ecran, nu o poarta. Poarta adevarata ramane pe
 * server, la trimitere, si refuza oricum ce nu are voie sa treaca.
 *
 * ⚠ GET, fara poarta de origine: nu scrie nimic, iar raspunsul (care poate purta
 * adresa omului) nu se poate citi de pe alt site, fiindca nu trimitem antete CORS.
 * `no-store`: e starea unui singur om, pe o singura clipa.
 */

/** Datele din profil, ca formularul de comanda sa-si completeze campurile goale. */
type DateLivrare = { nume: string; telefon: string; adresa: AdresaProfil };

type Raspuns = { cere: boolean; logat: boolean; email: string | null; livrare?: DateLivrare | null };

const NIMIC: Raspuns = { cere: false, logat: false, email: null };

function raspunde(r: Raspuns, status = 200) {
  return NextResponse.json(r, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(req: NextRequest) {
  let magazin;
  try {
    magazin = await magazinulDupaGazda(req.headers.get("host"));
    if (magazin && (await magazinulEOprit(magazin))) magazin = null;
  } catch {
    /* Formularul trimite atunci ca de obicei, iar serverul hotaraste. */
    return raspunde(NIMIC, 503);
  }
  if (!magazin) return raspunde(NIMIC);

  const poarta = await poartaContuluiLaComanda({
    businessId: magazin.id,
    config: magazin.contClientConfig,
    jurnal: false,
  }).catch(() => null);
  if (!poarta) return raspunde(NIMIC, 503);
  if (!poarta.ok) return raspunde({ cere: poarta.contNecesar, logat: false, email: null });
  if (!poarta.contId) return raspunde(NIMIC);

  /* Adresa e numai pentru ecran („Comanzi din contul ...") si pentru campul de
     email gol; lipsa ei nu schimba nimic. */
  let email: string | null = null;
  try {
    const contacte = (await contacteleMele(magazin.id, poarta.contId)).filter((c) => c.fel === "email");
    email = (contacte.find((c) => c.verificat) ?? contacte[0])?.valoareBruta ?? null;
  } catch {
    email = null;
  }
  /* Profilul (numele, telefonul, adresa salvata): tot numai pentru campurile goale ale formularului. */
  let livrare: DateLivrare | null = null;
  try {
    const p = await profilulContului(magazin.id, poarta.contId);
    livrare = { nume: p.nume, telefon: p.telefon, adresa: p.adresa };
  } catch {
    livrare = null;
  }
  return raspunde({ cere: false, logat: true, email, livrare });
}
