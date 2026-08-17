/*
 * Motivele de respingere ale lui About You, in romana, cu remediul.
 *
 * Comerciantul vedea „Respins" si atat. `rejectionCount` se calcula pe server si
 * nu se afisa nicaieri, iar `rejection_reasons` — singurul loc unde scrie CE
 * anume e greșit — rămânea in baza, necitit. Iar mesajele lor sunt in engleza si
 * scrise pentru integratori, nu pentru un comerciant roman.
 *
 * Setul e INCHIS si documentat: zece motive, trei grupe (`user-guide/product-rejection.md`).
 * Potrivirea se face pe `name`, normalizat, fiindca formele exacte variaza intre
 * `GET /products/rejected` si webhookul `product_master.status_updated`. Un motiv
 * necunoscut NU se inghite: se arata textul lor brut, ca omul sa aiba de unde
 * pleca. Regula generala din documentatia lor: dupa ce repari datele, cere „request
 * a review" din Seller Center — corectia singura nu redeschide evaluarea.
 */
export interface MotivTradus {
  titlu: string;
  remediu: string;
}

function cheieNormalizata(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}+/gu, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

const MOTIVE: Record<string, MotivTradus> = {
  first_bust_or_model_image_missing: {
    titlu: "Lipsește prima imagine pe fundal alb sau imaginea cu model",
    remediu: "About You cere obligatoriu o primă imagine a produsului pe fundal alb sau transparent, în format 3:4, iar pentru modă și una purtată pe model. La încălțăminte, prima imagine trebuie să fie pantoful STÂNG orientat spre stânga.",
  },
  background_not_white_transparent_or_light_grey: {
    titlu: "Fundalul imaginii nu e alb, transparent sau gri deschis",
    remediu: "Prima imagine cere fundal alb sau transparent. Imaginea cu model acceptă și gri deschis, exact #F4F4F5.",
  },
  wrong_viewing_angle: {
    titlu: "Unghiul primei imagini nu e cel cerut",
    remediu: "Modă și accesorii: frontal. Încălțăminte: pantoful stâng, orientat spre stânga, la 30 sau 50 de grade. Șepci și pălării: frontal sau ușor spre stânga.",
  },
  images_and_descriptive_data_are_different: {
    titlu: "Imaginile nu se potrivesc cu datele trimise",
    remediu: "Imaginile arată altceva decât spun atributele sau descrierea. Verifică atât imaginile, cât și atributele completate pentru varianta de culoare afectată.",
  },
  product_photos_not_matching_selected_color: {
    titlu: "Fotografiile nu corespund culorii alese",
    remediu: "Toate variantele de culoare trebuie să arate același produs. Altfel About You le leagă greșit între ele, ca produse înrudite.",
  },
  wrong_sizes: {
    titlu: "Mărimile sunt greșite sau inconsecvente",
    remediu: "Mărimile trebuie să fie valori cunoscute și de același fel în interiorul unei culori: nu amesteca „34” cu „M”. Dacă produsul are o a doua dimensiune (cupă sau lungime de crac), ea e obligatorie pe TOATE variantele aceleiași culori.",
  },
  missing_or_wrong_brand: {
    titlu: "Brandul lipsește sau nu se potrivește",
    remediu: "Brandul trimis trebuie să fie exact cel care apare pe imaginile produsului. Poți alege alt brand pentru fiecare produs, din editorul de listare.",
  },
  prices_are_configured_incorrectly: {
    titlu: "Prețurile sunt configurate greșit",
    remediu: "Verifică prețurile variantelor afectate. Prețul tăiat trebuie să fie mai mare decât cel de vânzare, iar zero nu e acceptat.",
  },
  missing_material_specification: {
    titlu: "Compoziția materialului lipsește sau e incompletă",
    remediu: "Procentele trebuie să însumeze 100% în fiecare grupă, iar cel mult 15% poate fi material nespecificat. Încălțămintea cere trei grupe (exterior, interior sau talpă, talpă exterioară), jachetele două (exterior și căptușeală).",
  },
  blocklisted_term_design: {
    titlu: "Termen sau design blocat de About You",
    remediu: "Produsul conține un termen ori seamănă prea mult cu un design înregistrat ca marcă. About You nu îl poate vinde, nici acum, nici mai târziu. Nu există remediu: produsul trebuie să rămână retras.",
  },
};

/** Grupele lor de probleme, pentru cazul in care doar `type` vine completat. */
const GRUPE: Record<string, string> = {
  image_requirements_are_not_fulfilled: "Cerințe de imagine neîndeplinite",
  inconsistent_data: "Date inconsecvente",
  ay_internal: "Motiv interior About You",
};

export interface MotivRespingere {
  key?: string | null;
  type?: string | null;
  name?: string | null;
  description?: string | null;
}

export interface MotivAfisat {
  titlu: string;
  remediu: string | null;
  /** Textul lor original, pastrat cand nu avem o traducere. */
  original: string | null;
}

export function traduMotiv(m: MotivRespingere): MotivAfisat {
  for (const candidat of [m.name, m.key]) {
    if (!candidat) continue;
    const tradus = MOTIVE[cheieNormalizata(candidat)];
    if (tradus) return { titlu: tradus.titlu, remediu: tradus.remediu, original: null };
  }
  // Necunoscut: nu inventam si nu inghitim. Aratam ce au trimis ei.
  const grupa = m.type ? GRUPE[cheieNormalizata(m.type)] : null;
  return {
    titlu: m.name?.trim() || grupa || "Motiv nespecificat de About You",
    remediu: null,
    original: m.description?.trim() || null,
  };
}

export function traduMotive(motive: unknown): MotivAfisat[] {
  if (!Array.isArray(motive)) return [];
  return motive
    .filter((m): m is MotivRespingere => !!m && typeof m === "object")
    .map(traduMotiv);
}
