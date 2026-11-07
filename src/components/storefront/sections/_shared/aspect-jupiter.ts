/*
  Aspectul comun al sectiunilor temei Jupiter (etapa 23 din `docs/editor-magazin/PLAN.md`: „sa nu fie identica 1 la 1
  cu Dedeman”). O singura sursa, ca titlurile si fondurile placilor sa nu se desparta intre sectiuni.
*/

/** Titlul unei sectiuni a temei: mare, ingrosat, strans. Fontul vine din `--st-font-heading`, pus de sectiune. */
export const TITLU_SECTIUNE = "text-[24px] sm:text-[28px] font-bold tracking-tight leading-tight text-[var(--st-text)] mb-5";

/** Fondul placilor cu poze decupate (categorii, recomandari, cardurile bannerului): gri cu o urma de culoare principala. */
export const FOND_PLACA = "color-mix(in srgb, var(--st-primary) 4%, #F4F5F7)";

/** Fondul in degrade al placilor mari (cardurile bannerului, recomandarile): din culoarea principala spre fondul placii. */
export const DEGRADE_PLACA = "linear-gradient(135deg, color-mix(in srgb, var(--st-primary) 11%, #FFFFFF) 0%, color-mix(in srgb, var(--st-primary) 3%, #F7F8FA) 100%)";
