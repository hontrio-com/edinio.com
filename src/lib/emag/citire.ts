/**
 * Citirile care nu confunda „nu exista" cu „n-am putut intreba".
 *
 * ⚠ CORPUL S-A MUTAT in `@/lib/supabase/rand-citit` pe 26.08.2026: auditul Trendyol a gasit
 * exact aceeasi clasa de defect acolo, iar regula sta degeaba scrisa daca sta intr-un folder
 * pe care celelalte integrari nu-l citesc.
 *
 * ⚠ Fisierul RAMANE, ca reexport: toti apelantii din `src/lib/emag` importa `./citire`, iar
 * `citire.test.ts` politeaza dupa numele astea. Mutarea n-are voie sa ceara si o rescriere a
 * douazeci de importuri — aia ar fi fost o schimbare mare pentru un castig de organizare.
 */
export { EroareCitireBaza, randCitit, randuriCitite } from "@/lib/supabase/rand-citit";
