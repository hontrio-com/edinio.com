/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MAI MULTE ETICHETE, LIPITE INTR-UN SINGUR PDF                 (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ DE CE O BIBLIOTECA, DESI `emag/pdf-simplu.ts` SPUNE CA N-AM VRUT UNA.
 *
 * Acolo era vorba de a SCRIE o pagina cu douasprezece randuri de text: un PDF de o
 * pagina e un format mic si asezat, se scrie o data si nu se mai schimba. Aici e
 * vorba de a CITI PDF-uri facute de saisprezece curieri si de a le pune cap la cap,
 * ceea ce cere tabela de referinte incrucisate, renumerotarea obiectelor si fonturile
 * incorporate ale fiecaruia. Scris de mana, ar fi fost un analizor de PDF-uri — adica
 * exact felul de cod care merge pe cele trei fisiere incercate si se rupe pe al
 * patrulea, la un comerciant, cu coletele pe masa.
 *
 * ⚠ SE INCARCA LA CERERE (`await import`), nu la pornirea modulului. Asa cele cateva
 * sute de kiloocteti intra in pachet o singura data, pe ruta care chiar lipeste, si
 * nu atarna de gatul niciunei alte porniri reci. Obiectia din `pdf-simplu.ts` ramane
 * valabila si e respectata aici.
 *
 * ⚠ O ETICHETA STRICATA NU RUPE DOCUMENTUL. PDF-urile vin de la saisprezece furnizori
 * si nu toate sunt curate; una singura refuzata de biblioteca ar fi lasat lotul fara
 * niciuna. Se sare peste ea si se merge mai departe — pagina care lipseste se vede
 * numarand, si numarul iese si in antetul raspunsului.
 */

/** Cate documente au fost lipite si cate au fost refuzate de biblioteca. */
export interface Lipire {
  octeti: Uint8Array;
  lipite: number;
  refuzate: number;
}

/**
 * Lipeste documentele, pastrand ordinea si marimea fiecarei pagini.
 *
 * ⚠ Marimea NU se uniformizeaza: o eticheta de 10x14 ramane de 10x14, si una A4
 * ramane A4. Intinsa pe A4, eticheta mica ar fi iesit cu codul de bare marit, iar
 * scanerele citesc gresit un cod scalat.
 */
export async function lipesteCuNumar(documente: Uint8Array[]): Promise<Lipire> {
  const { PDFDocument } = await import("pdf-lib");
  const iesire = await PDFDocument.create();

  let lipite = 0;
  let refuzate = 0;
  for (const d of documente) {
    try {
      const sursa = await PDFDocument.load(d, { ignoreEncryption: true });
      const pagini = await iesire.copyPages(sursa, sursa.getPageIndices());
      for (const p of pagini) iesire.addPage(p);
      lipite++;
    } catch {
      /* Vezi nota din capul fisierului: una stricata nu le doboara pe celelalte. */
      refuzate++;
    }
  }

  return { octeti: await iesire.save(), lipite, refuzate };
}

/** Forma ceruta de `adunaEtichete`: doar octetii. */
export async function lipesteDocumente(documente: Uint8Array[]): Promise<Uint8Array> {
  return (await lipesteCuNumar(documente)).octeti;
}
