"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, MailOpen, MessageSquare, Send, ShoppingBag, ShoppingCart } from "lucide-react";

import { formatPrice } from "@/lib/utils/format";
import { orderStatus } from "@/lib/orders/status";
import { getCustomerActivity, type ActivitateClient } from "@/lib/actions/customer.actions";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CE S-A INTAMPLAT CU OMUL ASTA, IN ORDINE
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ NUMAI ACTIVITATI COMERCIALE, cum a cerut proprietarul: comenzi, cosuri
  lasate, mesaje trimise si mesaje deschise. Nu se urmareste comportament in
  plus — nu se scrie nicaieri ce pagini a vizitat sau cat a stat pe ele.

  ⚠ PE CE STA, MASURAT PE PRODUCTIE (21.09.2026): 537 de comenzi, 390 de cosuri
  abandonate si 463 de SMS-uri au deja date. Mesajele de recuperare au plecat in
  productie CHIAR AZI si n-au niciun rand inca; se vor aduna singure. Pana
  atunci pur si simplu nu apar randuri de felul lor, ceea ce e adevarat.

  ⚠ SE CERE LA DESCHIDEREA FILEI, nu odata cu lista: patru izvoare unite pentru
  fiecare client din pagina ar fi insemnat cincizeci de cronologii aduse degeaba.
*/

const FELURI: Record<string, { icon: typeof ShoppingBag; ton: string; ce: string }> = {
  comanda: { icon: ShoppingBag, ton: "text-success bg-success/10", ce: "A plasat comanda" },
  cos: { icon: ShoppingCart, ton: "text-warning bg-warning/10", ce: "A lăsat un coș" },
  sms: { icon: MessageSquare, ton: "text-info bg-info/10", ce: "I s-a trimis un SMS" },
  recuperare: { icon: Send, ton: "text-info bg-info/10", ce: "I s-a trimis un mesaj de recuperare" },
  "recuperare-deschisa": { icon: MailOpen, ton: "text-primary bg-primary/10", ce: "A deschis mesajul de recuperare" },
};

function cand(iso: string): string {
  return new Date(iso).toLocaleString("ro-RO", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function Activitate({ businessId, cheie }: { businessId: string; cheie: string }) {
  const [randuri, setRanduri] = useState<ActivitateClient[] | null>(null);
  const [eroare, setEroare] = useState("");

  useEffect(() => {
    let anulat = false;
    void (async () => {
      let r: Awaited<ReturnType<typeof getCustomerActivity>>;
      try {
        r = await getCustomerActivity(businessId, cheie);
      } catch {
        /* ⚠ O CITIRE: nimic nu s-a schimbat, deci se poate reincerca inchizand si
           redeschizand fisa. Fara prindere, aruncarea ar inlocui tot panoul cu 500. */
        if (!anulat) setEroare("Nu am primit răspuns. Închide și deschide din nou fișa.");
        return;
      }
      if (anulat) return;
      if ("error" in r) { setEroare(r.error); return; }
      setRanduri(r.activitate);
    })();
    return () => { anulat = true; };
  }, [businessId, cheie]);

  if (eroare) {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {eroare}
      </p>
    );
  }

  if (randuri === null) {
    return (
      <p className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Adun activitatea…
      </p>
    );
  }

  if (randuri.length === 0) {
    return (
      <p className="py-6 text-xs text-muted-foreground">
        Nicio activitate înregistrată pentru clientul ăsta.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {randuri.map((a, i) => {
        const f = FELURI[a.fel] ?? { icon: ShoppingBag, ton: "text-muted-foreground bg-muted", ce: a.fel };
        const Icon = f.icon;
        return (
          <li key={`${a.fel}-${a.cand}-${i}`} className="flex gap-3">
            <span className={`mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg ${f.ton}`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-foreground">
                {f.ce}
                {a.fel === "comanda" && a.titlu && <span className="font-semibold"> {a.titlu}</span>}
                {a.suma != null && <span className="font-semibold"> · {formatPrice(a.suma)}</span>}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {cand(a.cand)}
                {/*
                  ⚠ Starea comenzii se scrie cu vocabularul panoului, nu cu cheia din
                  bază: „delivered" nu înseamnă nimic pentru comerciant.
                */}
                {a.fel === "comanda" && a.detaliu && ` · ${orderStatus(a.detaliu).label}`}
                {a.fel !== "comanda" && a.detaliu && ` · ${a.detaliu}`}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
