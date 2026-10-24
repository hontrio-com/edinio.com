# Registrul editorului unic

Tot ce productia NU are inca. Se scrie in clipa schimbarii, nu la final.

## Ordinea de la final
1. Porti: `tsc`, `npm test`, `npm run build`, `lint:prag --check`, `tipuri-db`, `schema-baseline.sh --check`, `coloane-cerute-exista`.
2. Migratiile din tabelul A, in ordine (aditive inainte de push, revocari/stergeri dupa).
3. Baseline regenerat in acelasi commit.
4. Variabilele din tabelul B in Vercel (Production) inainte de push.
5. Unire `editor-magazin` -> `main`, push, verificare productie + CI.

## A. Migratii
| nr | fisier | ce face | demo | productie |
|---|---|---|---|---|
| - | - | - | - | - |

## B. Variabile de mediu noi
| cheie | de ce | pusa in Vercel |
|---|---|---|
| - | - | - |

## C. Ce se verifica dupa push
- magazine reale fara design atins (`storefront_design = {}`): arata la fel ca inainte.
- un magazin cu design salvat: arata la fel ca inainte.
