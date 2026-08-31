import Link from "next/link";
import { STIL_PAGINA_SIMPLA as S } from "@/lib/stil-pagina-simpla";

/*
  ⚠ FĂRĂ CLASE TAILWIND ȘI FĂRĂ IMPORT DE CSS — DINADINS. Vezi nota din
  `lib/stil-pagina-simpla.ts`: fișierul ăsta stă la rădăcina lui `app/`, deci
  face parte din arborele FIECĂREI rute. Orice foaie de stil importată aici se
  leagă pe toate paginile platformei, inclusiv pe magazinele comercianților.

  Măsurat pe 31.08.2026: cu `import "./website.css"` aici, un magazin încărca
  ȘI foaia aplicației (274 kB) ȘI pe cea de prezentare (108 kB). Adică
  despărțirea foilor înrăutățea exact paginile pe care trebuia să nu le atingă.
*/
export default function NotFound() {
  return (
    <div style={S.pagina}>
      <h1 style={S.numar}>404</h1>
      <p style={S.titlu}>Pagina nu a fost gasita</p>
      <p style={S.explicatie}>Pagina pe care o cauti nu exista sau a fost mutata.</p>
      <Link href="/" style={S.buton}>
        Inapoi la pagina principala
      </Link>
    </div>
  );
}
