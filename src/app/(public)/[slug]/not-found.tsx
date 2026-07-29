import Link from "next/link";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformHost } from "@/lib/seo";

/**
 * 404-ul magazinelor.
 *
 * Pana acum, orice adresa gresita de sub `/[slug]` cadea pe 404-ul radacinii —
 * pagina platformei, cu butonul „Inapoi la pagina principala" care ducea la
 * edinio.com. Pe domeniul unui comerciant, asta insemna ca o adresa gresita
 * scotea vizitatorul din magazin.
 *
 * Antetul paginii (titlu, descriere, OpenGraph) NU se scrie aici: `not-found.tsx`
 * nu accepta `generateMetadata`, iar antetul vine de la layout-ul de deasupra.
 * Acolo l-am pus, in `[slug]/layout.tsx`.
 *
 * Numele magazinului se poate afla doar pe domeniu propriu: aici nu exista
 * `params`, deci singurul indiciu e gazda. Pe adresa cu slug ramane un text
 * neutru — dar fara numele platformei, care era chiar problema.
 */
export default async function StoreNotFound() {
  const gazda = (await headers()).get("host")?.split(":")[0].toLowerCase() ?? "";
  let nume: string | null = null;
  let culoare = "#1AB554";

  if (gazda && !isPlatformHost(gazda)) {
    const fara = gazda.startsWith("www.") ? gazda.slice(4) : gazda;
    const { data } = await createAdminClient()
      .from("businesses")
      .select("business_name, store_name, primary_color")
      .or(`custom_domain.eq.${gazda},custom_domain.eq.${fara}`)
      .maybeSingle();
    if (data) {
      nume = data.store_name ?? data.business_name;
      culoare = data.primary_color ?? culoare;
    }
  }

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-16 text-center">
      <p className="text-6xl font-black text-zinc-200 dark:text-zinc-800">404</p>
      <h1 className="text-lg font-semibold mt-4">Pagina nu a fost gasita</h1>
      <p className="text-sm text-zinc-500 mt-1 max-w-md">
        {nume
          ? `Adresa pe care ai deschis-o nu exista in magazinul ${nume}. Poate a fost mutata sau stearsa.`
          : "Adresa pe care ai deschis-o nu exista sau a fost mutata."}
      </p>
      {/*
        „/" e radacina magazinului pe domeniu propriu si radacina platformei pe
        adresa cu slug — unde oricum nu stim slug-ul. In ambele cazuri duce
        undeva, ceea ce e tot ce trebuie sa faca un 404.
      */}
      <Link href="/"
        className="mt-6 px-5 py-2.5 text-sm font-semibold rounded-xl text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: culoare }}>
        Inapoi la pagina principala
      </Link>
    </div>
  );
}
