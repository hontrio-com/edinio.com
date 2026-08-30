/**
 * Numele butoanelor din ecranul eMAG, scrise o singură dată.
 *
 * ═══ ⚠ DE CE EXISTĂ FIȘIERUL ĂSTA ═══
 *
 * Pe 23.08.2026, `ceLipsestePentruPublicare` trimitea comerciantul „în setările
 * integrării” după două câmpuri care nu existau nicăieri. S-a reparat.
 *
 * Pe 24.08.2026 s-a întâmplat din nou, la câteva ore după: paza nouă spunea „apasă
 * «Importă din eMAG»”, iar butonul se numea atunci „Adu ofertele”. A întrebat chiar
 * comerciantul, cuvânt cu cuvânt: *„nu există buton cu «Importă din eMag», eu îl văd
 * doar pe ăsta cu «Adu ofertele»”*. (Numele s-a schimbat de atunci, tot la cererea
 * lui, fiindcă „Adu ofertele” nu spunea ce se întâmplă. Fișierul ăsta e chiar motivul
 * pentru care redenumirea a fost o singură linie.)
 *
 * De două ori aceeași greșeală, în două zile, arată că nu e o scăpare — e o gaură în
 * felul în care scriem. Un mesaj care numește un buton și butonul însuși stăteau în
 * fișiere diferite, fără nimic care să le țină legate: nici compilatorul, nici o probă,
 * nimic. Prima redenumire le despărțea, tăcut.
 *
 * ⚠ Acum sunt același șir. Ecranul îl **randează**, mesajele îl **citează**, iar
 * probele verifică potrivirea. Redenumit aici, se schimbă peste tot deodată; redenumit
 * în ecran fără să treacă pe aici, nu compilează.
 */

/**
 * Titlul blocului, și numele pe care îl citează toate mesajele.
 *
 * Se citează ĂSTA, nu cel de pe fața butonului: omul scanează pagina după titluri,
 * iar titlul e cel care spune și de unde (`din eMAG`).
 */
export const BUTON_ADU_OFERTELE = "Leagă produsele cu ofertele tale de pe eMAG";

/**
 * Ce scrie pe fața butonului, unde nu încape titlul întreg.
 *
 * ⚠ Trebuie să fie o bucată din titlu, și o probă verifică asta. Altfel titlul putea
 * ajunge „Sincronizează” și butonul „Adu ofertele”, iar mesajul ar fi trimis la un
 * nume pe care nu-l poartă niciunul — chiar felul de scăpare pentru care există
 * fișierul.
 */
export const BUTON_ADU_OFERTELE_SCURT = "Leagă produsele";

/** Blocul de setări cerute înainte de prima publicare. */
export const BLOC_PREGATIRE_PUBLICARE = "Ce cere eMAG înainte de prima publicare";
