import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { incarcaConfigurator } from "@/lib/actions/configurator.actions";
import { ConfiguratorBuilder } from "@/components/dashboard/configurator/ConfiguratorBuilder";

export const metadata: Metadata = { title: "Configurator" };

/**
 * Builderul unui configurator.
 *
 * ⚠ FARA `Suspense` aici, spre deosebire de lista. Builderul are nevoie de ciorna INTREAGA
 * inainte sa poata desena ceva — un schelet urmat de o pagina care sare la loc n-ar ajuta pe
 * nimeni, si ar face ca prima interactiune sa cada pe o stare inca goala.
 */
export default async function PaginaBuilder({
  params,
}: {
  params: Promise<{ configuratorId: string }>;
}) {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { configuratorId } = await params;
  const r = await incarcaConfigurator(configuratorId);

  /*
   * ⚠ Nu `notFound()`. „Nu exista" si „n-am putut citi" arata la fel intr-un 404, dar inseamna
   * lucruri opuse — iar al doilea l-ar face pe comerciant sa creada ca si-a pierdut munca.
   * Se spune ce s-a intamplat, si se lasa un drum inapoi.
   */
  if ("error" in r) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-lg rounded-xl border border-border bg-card px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">{r.error}</p>
          <Link
            href="/dashboard/products/configurators"
            className="mt-4 inline-block rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            Inapoi la configuratoare
          </Link>
        </div>
      </div>
    );
  }

  return <ConfiguratorBuilder initial={r.configurator} />;
}
