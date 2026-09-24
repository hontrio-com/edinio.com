import { BellRing } from "lucide-react";
import type { Preferinte } from "@/lib/cont/preferinte";
import { ComutatorPreferinta } from "../ComutatorPreferinta";
import { Mesaj, Sectiune } from "../ui/piese";

export function EcranPreferinte({ pref }: { pref: Preferinte }) {
  return (
    <>
      <Sectiune titlu="Mesaje de la magazin" icon={BellRing} descriere="Alegerea se aplica tuturor contactelor confirmate din cont.">
        <div className="divide-y divide-[var(--st-border)]">
          {pref.areEmail ? (
            <ComutatorPreferinta
              canal="email"
              pornit={pref.primesteEmail}
              eticheta="Emailuri despre produsele lasate in cos"
              explicatie="Primesti un email daca lasi produse in cos fara sa finalizezi comanda."
            />
          ) : (
            <p className="py-4 text-sm text-[var(--st-muted)] first:pt-0">Nu ai nicio adresa de email confirmata in cont.</p>
          )}
          {pref.areTelefon ? (
            <ComutatorPreferinta
              canal="sms"
              pornit={pref.primesteSms}
              eticheta="Oferte prin SMS"
              explicatie="Mesaje promotionale trimise de magazin prin SMS."
            />
          ) : (
            <p className="py-4 text-sm text-[var(--st-muted)] last:pb-0">Nu ai niciun numar de telefon confirmat in cont.</p>
          )}
        </div>
      </Sectiune>

      {/*
        ⚠ Se spune pe fata ce NU opreste comutatorul. Un om care stinge
        „emailuri de la magazin" si apoi primeste confirmarea unei comenzi ar
        crede ca alegerea lui n-a fost respectata, cand de fapt cele doua sunt
        lucruri deosebite si asa trebuie sa ramana.
      */}
      <Mesaj>
        Mesajele despre comenzile tale (confirmare, livrare, factura, retur) se trimit in continuare, indiferent de
        aceste setari.
      </Mesaj>
    </>
  );
}
