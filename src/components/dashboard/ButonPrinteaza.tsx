"use client";

import { useState, type ComponentProps } from "react";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { printeazaEticheta } from "@/lib/orders/printeaza-eticheta";

/**
 * Ce aduce eticheta: raspunsul rutei (`fetch`), octetii gata primiti, sau textul unei erori.
 * `null` inseamna ca apelantul a spus deja omului ce s-a intamplat.
 */
export type AduEticheta = () => Promise<Response | Blob | Uint8Array | string | null>;

/**
 * Butonul „Printeaza" de langa „Descarca", in fiecare fereastra de AWB.
 *
 * ⚠ UN SINGUR BUTON PENTRU TOTI CURIERII. Fiecare fereastra isi aduce eticheta altfel (ruta
 * proprie, actiune cu base64, mai multe formate), dar ce urmeaza dupa e acelasi lucru de
 * saptesprezece ori: eroarea spusa pe nume, verificarea ca e un PDF si deschiderea printarii.
 * Scris in fiecare fereastra, s-ar fi dezbinat la prima schimbare. Vezi `printeaza-eticheta.ts`.
 */
export function ButonPrinteaza({
  aduce,
  children = "Printeaza",
  ...rest
}: { aduce: AduEticheta } & Omit<ComponentProps<typeof Button>, "onClick">) {
  const [lucrez, setLucrez] = useState(false);

  async function printeaza() {
    setLucrez(true);
    try {
      const r = await aduce();
      if (r == null) return;
      if (typeof r === "string") {
        toast.error(r);
        return;
      }
      let continut: Blob | Uint8Array;
      if (r instanceof Response) {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          toast.error((data as { error?: string }).error ?? "Nu am putut aduce eticheta.");
          return;
        }
        continut = await r.blob();
      } else {
        continut = r;
      }
      const rezultat = await printeazaEticheta(continut);
      if (rezultat === false) {
        toast.error("Eticheta primita nu este un PDF, deci nu se poate printa direct. Foloseste Descarca.");
      } else if (rezultat === "blocat") {
        toast.error("Browserul a blocat deschiderea etichetei. Permite ferestrele pop-up pentru acest site sau foloseste Descarca.");
      }
    } catch (e) {
      toast.error(`Nu am putut deschide eticheta pentru printare: ${(e as Error).message}`);
    } finally {
      setLucrez(false);
    }
  }

  return (
    <Button type="button" variant="outline" {...rest} onClick={printeaza} disabled={lucrez || rest.disabled}>
      {lucrez ? <Loader2 className="animate-spin" /> : <Printer />}
      {children}
    </Button>
  );
}
