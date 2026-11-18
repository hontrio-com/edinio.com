/*
  Feedurile de categorii si de branduri theMarketer, si ierarhia categoriilor folosita si de feedul de
  produse si de evenimentul `__sm__view_category`. Pur.

  Forma (developers.themarketer.com/reference/categories-feed si /brands-feed):
    categorie: id, name, hierarchy (obligatorii), url, image_url (optionale; „daca exista, o adresa valida
               de cel putin 10 caractere”);
    brand:     id, name (obligatorii), url, image_url (optionale, aceeasi regula).

  ⚠ IERARHIA E DUPA NUME. Produsul isi tine categoria ca TEXT (`products.category`), nu ca id, iar
  vitrina rezolva numele la PRIMA categorie cu numele acela, in ordinea din panou (`sort_order`, apoi
  `id`). Aceeasi regula aici: altfel feedul ar pune un produs sub alta ramura decat cea pe care o arata
  magazinul.

  ⚠ `|` E SEPARATORUL LOR. O categorie al carei nume contine `|` ar fi devenit doua niveluri; se scrie
  cu `/`.
*/

import { el, grup } from "@/lib/pepita/xml";

export type CategorieTM = {
  id: string;
  name: string;
  parent_id: string | null;
  image_url?: string | null;
  is_active?: boolean | null;
};

export type BrandTM = { nume: string; segment: string; logo: string | null };

const ADANCIME_MAXIMA = 12;

function numeCurat(n: string): string {
  return n.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
}

function cheieNume(n: string): string {
  return n.trim().toLocaleLowerCase("ro-RO");
}

/**
 * Ierarhia fiecarei categorii, dupa id: „Parinte|Copil|Nepot”. Categoriile vin in ordinea panoului.
 * ⚠ Un ciclu (A parinte lui B, B parinte lui A, scris direct in baza) se taie, nu se invarte la infinit.
 */
export function ierarhiiDupaId(categorii: readonly CategorieTM[]): Map<string, string> {
  const dupaId = new Map(categorii.map((c) => [c.id, c]));
  const rezultat = new Map<string, string>();
  for (const c of categorii) {
    const lant: string[] = [];
    const vazute = new Set<string>();
    let curent: CategorieTM | undefined = c;
    while (curent && !vazute.has(curent.id) && lant.length < ADANCIME_MAXIMA) {
      vazute.add(curent.id);
      const nume = numeCurat(curent.name);
      if (nume) lant.unshift(nume);
      curent = curent.parent_id ? dupaId.get(curent.parent_id) : undefined;
    }
    if (lant.length) rezultat.set(c.id, lant.join("|"));
  }
  return rezultat;
}

/**
 * Functia ceruta de feedul de produse: numele categoriei produsului → ierarhia ei. Prima categorie cu
 * numele acela castiga, ca in vitrina. Un nume necunoscut (categorie stearsa, scrisa de import) pleaca
 * asa cum e, singur: e tot ce stim despre el.
 */
export function ierarhieDupaNume(categorii: readonly CategorieTM[]): (nume: string | null) => string | null {
  const ierarhii = ierarhiiDupaId(categorii);
  const primaDupaNume = new Map<string, string>();
  for (const c of categorii) {
    const k = cheieNume(c.name);
    if (k && !primaDupaNume.has(k)) primaDupaNume.set(k, c.id);
  }
  return (nume) => {
    if (!nume || !nume.trim()) return null;
    const id = primaDupaNume.get(cheieNume(nume));
    return (id ? ierarhii.get(id) : null) ?? numeCurat(nume);
  };
}

/** O adresa pe care o primeste theMarketer: https si cel putin 10 caractere, altfel nimic. */
export function adresaValida(u: string | null | undefined): string | null {
  if (!u) return null;
  const s = String(u).trim();
  if (s.length < 10) return null;
  try {
    return new URL(s).protocol === "https:" ? s : null;
  } catch {
    return null;
  }
}

/** Un `<category>`. `url` vine de la apelant (depinde de cum isi arata magazinul catalogul). */
export function categorieXml(c: CategorieTM, ierarhie: string, url: string | null): string {
  return grup("category",
    el("name", numeCurat(c.name))
    + el("url", adresaValida(url))
    + el("id", c.id)
    + el("hierarchy", ierarhie)
    + el("image_url", adresaValida(c.image_url)),
  ) + "\n";
}

/** Un `<brand>`. Brandurile n-au id in platforma (o parte exista doar pe produse), deci id-ul e segmentul. */
export function brandXml(b: BrandTM, url: string | null): string {
  return grup("brand",
    el("name", b.nume.trim())
    + el("url", adresaValida(url))
    + el("id", b.segment)
    + el("image_url", adresaValida(b.logo)),
  ) + "\n";
}
