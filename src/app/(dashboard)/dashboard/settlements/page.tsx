import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { orSafeTerm } from "@/lib/orders/pagination";
import { fereastraPaginii } from "@/lib/paginare";
import { inGrupe } from "@/lib/liste/poze";
import {
  COLOANE_COLET, COLOANE_USOARE, coletDinRand, coletUsor, socotesteDecontarile, type Colet, type ColetUsor,
} from "@/components/dashboard/decontari/date";
import { filtreDinAdresa, PE_PAGINA, type FiltreDecont } from "@/components/dashboard/decontari/filtre";
import { ListaDecontari } from "@/components/dashboard/decontari/ListaDecontari";

export const metadata = { title: "Decontări" };

/**
 * „Decontări": banii pe care curierul i-a incasat la livrare si i-a virat comerciantului.
 *
 * ⚠ Pana pe 13.09.2026, singurul raspuns posibil la „mi-a virat FAN banii pe comanda asta?"
 * era extrasul de banca si potrivirea de mana. Randurile vin din `courier_settlements`, umplut
 * de `api/cron/fancourier-settlements`.
 *
 * ⚠ Tabelul e GENERIC pe `courier`: FAN il inaugureaza, ceilalti intra fara nicio migratie si
 * fara sa se schimbe nimic in pagina asta (isi capata singuri fila si sigla).
 *
 * ═══ CUM SE NUMARA SI SE ADUNA (25.11.2026) ═══
 *
 * Pana atunci pagina aducea cele mai noi 500 de randuri si socotea perioada si totalul in
 * browser, peste ele: un magazin cu 501 colete vedea un total care nu era al lui. Acum filtrul
 * intreg (cautare, perioada) se aduce in coloane USOARE (id, curier, zi, suma), in cereri de cate
 * `PE_CERERE`, pana la `LIMITA`; din ele ies numarul fiecarui curier, totalul si in cate virari
 * a venit (`socotesteDecontarile`). Abia pentru pagina de pe ecran se cer coloanele intregi.
 *
 * ⚠ Peste `LIMITA`, pagina spune limpede ca totalul cuprinde doar ce a socotit, si cate sunt cu
 * adevarat (`count: "exact"`). Un total calculat peste o lista taiata fara s-o spuna ar fi o
 * cifra in care comerciantul are incredere si NU trebuie: ar arata mai putini bani decat a primit.
 *
 * ⚠ DE FACUT cand registrele cresc: adunarea in SQL (o functie, deci o migratie), ca un magazin
 * cu zeci de mii de colete pe an sa nu-si mai aduca randurile usoare la fiecare deschidere.
 */

type Rand = Record<string, unknown>;

/** Cate randuri intoarce PostgREST cel mult intr-o cerere. */
const PE_CERERE = 1000;
/** Cate colete se socotesc cel mult. Peste, pagina spune ca totalul nu e intreg. */
const LIMITA = 20_000;

/** Ce trebuie sa stie un constructor de interogare ca sa primeasca filtrele listei. */
type Filtrabil<T> = {
  or(filtre: string): T;
  gte(coloana: string, valoare: string): T;
  lte(coloana: string, valoare: string): T;
};

/**
 * Cautarea si perioada, intr-un singur loc. Perioada e pe ziua VIRARII (cea de pe extrasul de
 * banca), cu amandoua capetele incluse; coloana e o zi, deci se compara zi cu zi, fara ore.
 * Cautarea merge pe ce se vede intr-un rand: AWB, AWB de retur, destinatar, localitate.
 */
function cuFiltre<T extends Filtrabil<T>>(interogare: T, f: FiltreDecont): T {
  let q = interogare;
  if (f.deLa) q = q.gte("transfer_date", f.deLa);
  if (f.panaLa) q = q.lte("transfer_date", f.panaLa);
  const term = orSafeTerm(f.q);
  if (term) {
    q = q.or(
      `awb_number.ilike.%${term}%,return_awb_number.ilike.%${term}%,recipient_name.ilike.%${term}%,recipient_locality.ilike.%${term}%`,
    );
  }
  return q;
}

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const [{ data: business }, sp] = await Promise.all([
    supabase
      .from("businesses").select("id").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(1).single(),
    searchParams,
  ]);
  if (!business) redirect("/dashboard");
  const idMagazin = business.id;

  const filtre = filtreDinAdresa(sp);
  const decontari = () => supabase.from("courier_settlements");

  /** O felie din coletele filtrului (cautare + perioada, FARA curier), in coloane usoare, cele mai noi virari intai. */
  const felie = (deLa: number, cuNumar: boolean) =>
    cuFiltre(decontari().select(COLOANE_USOARE, cuNumar ? { count: "exact" } : undefined).eq("business_id", idMagazin), filtre)
      .order("transfer_date", { ascending: false })
      .order("awb_number", { ascending: false })
      /* `id` ca departajator: fara el, doua randuri la fel s-ar putea aseza altfel de la o cerere la alta. */
      .order("id", { ascending: false })
      .range(deLa, deLa + PE_CERERE - 1);

  /**
   * Tot filtrul, in coloane usoare. Prima cerere spune si cate sunt; restul feliilor (pana la
   * `LIMITA`) pleaca deodata. ⚠ O felie cazuta nu se inghite: totalul ar iesi mai mic, in tacere.
   */
  async function toateUsoare(): Promise<{ colete: ColetUsor[]; inBaza: number; cazuta: boolean }> {
    const prima = await felie(0, true);
    const primele = (prima.data ?? []) as Rand[];
    const inBaza = Math.max(prima.count ?? 0, primele.length);
    let cazuta = !!prima.error;

    const deAdus = Math.min(inBaza, LIMITA);
    const porniri: number[] = [];
    for (let de = PE_CERERE; de < deAdus; de += PE_CERERE) porniri.push(de);
    const restul = await Promise.all(porniri.map((de) => felie(de, false)));

    const randuri = [...primele];
    for (const r of restul) {
      if (r.error) cazuta = true;
      randuri.push(...((r.data ?? []) as Rand[]));
    }
    return { colete: randuri.map(coletUsor), inBaza, cazuta };
  }

  const [usoare, { count: coleteMagazin }, { data: ultima }] = await Promise.all([
    toateUsoare(),
    decontari().select("id", { count: "exact", head: true }).eq("business_id", idMagazin),
    decontari().select("transfer_date").eq("business_id", idMagazin).order("transfer_date", { ascending: false }).limit(1),
  ]);

  const socoteala = socotesteDecontarile(usoare.colete, filtre.curier);

  /* Pagina de pe ecran. Se STRANGE la cate exista: un `?page=99` scris de mana arata ultima pagina. */
  const fereastra = fereastraPaginii(filtre.page, socoteala.aleCurierului.length, PE_PAGINA);
  const iduriPagina = socoteala.aleCurierului.slice(fereastra.deLa, fereastra.panaLa + 1).map((c) => c.id);

  /* Coloanele intregi, doar pentru coletele paginii. Lista de id-uri merge in adresa cererii: in grupe de o suta. */
  const intregi = new Map<string, Rand>();
  const raspunsuri = await Promise.all(
    inGrupe(iduriPagina).map((grup) => decontari().select(COLOANE_COLET).eq("business_id", idMagazin).in("id", grup)),
  );
  let paginaCazuta = false;
  for (const { data, error } of raspunsuri) {
    if (error) paginaCazuta = true;
    for (const r of data ?? []) intregi.set(r.id, r as Rand);
  }

  /* Numerele comenzilor, pentru legatura din rand („#1331"). */
  const iduriComenzi = [...new Set([...intregi.values()].map((r) => r.order_id).filter((v): v is string => typeof v === "string"))];
  const numereComenzi: Record<string, string> = {};
  const comenzi = await Promise.all(
    inGrupe(iduriComenzi).map((grup) => supabase.from("orders").select("id, order_number").eq("business_id", idMagazin).in("id", grup)),
  );
  for (const { data } of comenzi) for (const c of data ?? []) if (c.order_number) numereComenzi[c.id] = c.order_number;

  /* In ordinea listei usoare (cele mai noi virari intai), nu in cea in care au raspuns cererile. */
  const colete = iduriPagina
    .map((id) => intregi.get(id))
    .filter((r): r is Rand => r !== undefined)
    .map((r): Colet => coletDinRand(r, numereComenzi));

  return (
    <ListaDecontari
      filtre={{ ...filtre, page: fereastra.pagina }}
      colete={colete}
      rezumat={{
        colete: socoteala.aleCurierului.length,
        virari: socoteala.virari,
        suma: socoteala.suma,
        /*
          Lista a fost taiata doar cand filtrul are in baza mai mult decat `LIMITA` (o felie cazuta
          se spune separat, prin `citireCazuta`). Cate are filtrul in baza se stie doar fara
          filtrul de curier; cu el, taierea se vede tot din numarul fara el.
        */
        inBaza: usoare.inBaza > LIMITA ? usoare.inBaza : socoteala.aleCurierului.length,
        limita: LIMITA,
      }}
      curieri={socoteala.curieri}
      magazin={{ colete: coleteMagazin ?? 0, ultimaVirare: ultima?.[0]?.transfer_date ?? null }}
      citireCazuta={usoare.cazuta || paginaCazuta}
    />
  );
}
