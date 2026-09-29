/**
 * Eticheta Curiera pe o pagina A5, facuta de NOI din cea A6.
 *
 * Cerut de el pe 29.09.2026. ⚠ Curiera NU stie A5: `print` accepta `a4|a6` (documentatia), iar
 * `format=a5` e ignorat TACUT, cu raspuns 200 si pagina A6 (295,2 x 417,6 pt), masurat pe un AWB
 * de test emis si anulat anume. Deci A5 se cere de la ei ca A6 si se mareste aici, pastrand
 * proportia, centrat pe pagina.
 *
 * ⚠ CODUL DE BARE SE MARESTE SI EL, de ~1,42 ori, iar la Curiera e o IMAGINE (396 x 50 px), nu
 * desen vectorial. `lipeste-pdf.ts` nu scaleaza nimic tocmai de aceea („scanerele citesc gresit
 * un cod scalat"). Aici e o alegere a comerciantului, spusa pe fata in configurare si in ajutor:
 * o eticheta tiparita si scanata inainte sa conteze.
 *
 * ⚠ `pdf-lib` se incarca LA CERERE, ca in `lipeste-pdf.ts`: cele cateva sute de kiloocteti nu
 * atarna de pornirea rece a altor rute.
 */

/** A5 in puncte PDF: 148 x 210 mm. */
export const A5_PT = { latime: 419.53, inaltime: 595.28 } as const;

/** Cat se mareste o pagina si unde se aseaza, ca sa incapa pe A5 cu proportia pastrata, centrata. */
export function potrivirePeA5(latime: number, inaltime: number): { scara: number; x: number; y: number } {
  const scara = Math.min(A5_PT.latime / latime, A5_PT.inaltime / inaltime);
  return {
    scara,
    x: (A5_PT.latime - latime * scara) / 2,
    y: (A5_PT.inaltime - inaltime * scara) / 2,
  };
}

/**
 * Fiecare pagina a etichetei (la mai multe colete Curiera da cate una pe colet) pe o pagina A5.
 * Arunca daca PDF-ul nu se poate citi; cine cheama hotaraste ce da in loc.
 */
export async function etichetaPeA5(pdf: Uint8Array): Promise<Buffer> {
  const { PDFDocument } = await import("pdf-lib");
  const sursa = await PDFDocument.load(pdf, { ignoreEncryption: true });
  const iesire = await PDFDocument.create();
  const pagini = await iesire.embedPages(sursa.getPages());
  for (const p of pagini) {
    const { scara, x, y } = potrivirePeA5(p.width, p.height);
    iesire.addPage([A5_PT.latime, A5_PT.inaltime]).drawPage(p, { x, y, xScale: scara, yScale: scara });
  }
  return Buffer.from(await iesire.save());
}
