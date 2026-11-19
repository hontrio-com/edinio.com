#!/usr/bin/env python3
"""
Fisierele de font cu DOAR literele romanesti (public/fonturi-ro/) si lista lor (src/lib/fonturi-ro.ts).

De ce exista (19.11.2026, auditul temelor): `next/font/google` imparte fiecare font pe subseturi, iar literele
ă, ș, ț (si variantele cu sedila, ş ţ) stau in subsetul „latin-ext”, langa sute de litere poloneze, cehe, turcesti,
vietnameze. O pagina romaneasca descarca deci, pe fiecare familie folosita, tot fisierul latin-ext (15-85 KB) pentru
sase-zece litere. Masurat pe build: pe tema Jupiter (Plus Jakarta Sans + Inter), 106 KB din 211 KB de fonturi.

Aici se taie, din chiar fisierele latin-ext ale build-ului, cate un fisier mic (1-4 KB) doar cu literele romanesti
si cu dublul accent unguresc (ő ű). Vitrina le declara intr-un `@font-face` cu ACELASI nume de familie, pus dupa
fetele `next/font` (`FeteRomanesti`): la intervale suprapuse browserul ia ultima fata declarata, deci pentru „ă” cere
fisierul mic, iar latin-ext se mai descarca doar pe o pagina care chiar are alte litere din el.

Desenul literelor, latimile, axele variabile si kerning-ul dintre ele raman cele din fisierul original: e un subset,
nu alt font.

Rulare (dupa un `next build` local, din radacina proiectului):

    python scripts/fonturi-ro.py

Cere `fonttools` si `brotli` (pip install fonttools brotli). Se ruleaza din nou doar cand se adauga un font in
`components/pages/fonturi-incarcate.ts` / `lib/storefront/design/fonts.ts` / `app/layout.tsx`; proba
`src/lib/fonturi-ro.test.ts` cade cand un font declarat n-are fisierul lui.
"""
import glob
import hashlib
import io
import os
import re
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

RAD = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEXT = os.path.join(RAD, ".next", "static")
IESIRE = os.path.join(RAD, "public", "fonturi-ro")
LISTA = os.path.join(RAD, "src", "lib", "fonturi-ro.ts")

# Ă ă, Ș ș Ț ț (virgula), Ş ş Ţ ţ (sedila, din textele vechi si de pe tastaturile fara layout romanesc), Ő ő Ű ű.
LITERE = [0x102, 0x103, 0x218, 0x219, 0x21A, 0x21B, 0x15E, 0x15F, 0x162, 0x163, 0x150, 0x151, 0x170, 0x171]


def fete_latin_ext():
    """Fetele latin-ext din CSS-ul build-ului: (familie, stil, greutate) -> fisierul woff2."""
    gasite = {}
    for css in glob.glob(os.path.join(NEXT, "chunks", "*.css")):
        text = io.open(css, encoding="utf-8").read()
        for corp in re.findall(r"@font-face\s*\{([^}]*)\}", text):
            interval = re.search(r"unicode-range:\s*([^;]+)", corp)
            if not interval or not interval.group(1).strip().upper().startswith("U+100-2BA"):
                continue
            familie = re.search(r"font-family:\s*[\"']?([^;\"']+)", corp).group(1).strip()
            stil = (re.search(r"font-style:\s*([^;]+)", corp) or [None, "normal"])[1].strip()
            greutate = (re.search(r"font-weight:\s*([^;]+)", corp) or [None, "400"])[1].strip()
            url = re.search(r"url\(([^)]+)\)", corp).group(1).strip("\"'")
            fisier = os.path.join(NEXT, "media", os.path.basename(url))
            # Acelasi fisier apare si cu `.p.` in nume (varianta preincarcata): oricare e bun.
            if not os.path.exists(fisier):
                fisier = fisier.replace(".p.", ".")
            if os.path.exists(fisier):
                gasite[(familie, stil, greutate)] = fisier
    return gasite


def intervale(coduri):
    """[0x102, 0x103, 0x218] -> "U+102-103,U+218"."""
    coduri = sorted(coduri)
    bucati, start, prec = [], None, None
    for c in coduri + [None]:
        if start is None:
            start = prec = c
            continue
        if c is not None and c == prec + 1:
            prec = c
            continue
        bucati.append("U+%X" % start if start == prec else "U+%X-%X" % (start, prec))
        start = prec = c
    return ",".join(bucati)


def nume_fisier(familie, stil, greutate, octeti):
    baza = re.sub(r"[^a-z0-9]+", "-", familie.lower()).strip("-")
    parte = [baza, stil]
    # Greutatea in nume doar la familiile cu un fisier pe greutate (Poppins); la cele variabile e un interval.
    if " " not in greutate:
        parte.append(greutate)
    # Amprenta continutului in nume: `next.config` pune `immutable` pe un an pe tot ce e `.woff2`, deci un fisier
    # schimbat trebuie sa aiba alt nume, altfel browserele il tin pe cel vechi.
    return "-".join(parte) + "." + hashlib.sha1(octeti).hexdigest()[:8] + ".woff2"


def main():
    fete = fete_latin_ext()
    if not fete:
        sys.exit("Nicio fata latin-ext in .next/static/chunks/*.css: ruleaza intai `next build`.")
    os.makedirs(IESIRE, exist_ok=True)
    # Fisierele de dinainte pleaca: numele poarta amprenta, deci cele vechi ar ramane orfane.
    for vechi in glob.glob(os.path.join(IESIRE, "*.woff2")):
        os.remove(vechi)
    randuri, total_inainte, total_dupa = [], 0, 0
    for (familie, stil, greutate), sursa in sorted(fete.items()):
        # Fara data de azi in fisier: aceeasi sursa da aceiasi octeti, deci acelasi nume.
        font = TTFont(sursa, recalcTimestamp=False)
        acoperite = [c for c in LITERE if c in font.getBestCmap()]
        if not acoperite:
            print("  (fara litere romanesti) %s %s %s" % (familie, stil, greutate))
            continue
        optiuni = subset.Options()
        optiuni.flavor = "woff2"
        optiuni.layout_features = ["*"]
        optiuni.notdef_outline = True
        optiuni.name_IDs = [1, 2, 3, 4, 6]
        taietor = subset.Subsetter(optiuni)
        taietor.populate(unicodes=acoperite)
        taietor.subset(font)
        font.flavor = "woff2"
        tampon = io.BytesIO()
        font.save(tampon)
        octeti = tampon.getvalue()
        iesire = nume_fisier(familie, stil, greutate, octeti)
        io.open(os.path.join(IESIRE, iesire), "wb").write(octeti)
        inainte, dupa = os.path.getsize(sursa), len(octeti)
        total_inainte += inainte
        total_dupa += dupa
        randuri.append((familie, stil, greutate, iesire, intervale(acoperite)))
        print("%-26s %-7s %-9s %6d -> %5d octeti  %s" % (familie, stil, greutate, inainte, dupa, intervale(acoperite)))

    linii = [
        "/*",
        "  GENERAT de `python scripts/fonturi-ro.py`. NU se editeaza de mana.",
        "",
        "  Fisierele de font cu doar literele romanesti (`public/fonturi-ro/`), taiate din subsetul latin-ext al fiecarei",
        "  familii incarcate prin `next/font`. Le declara `components/pages/FeteRomanesti.tsx`; de ce, in antetul scriptului.",
        "*/",
        "",
        "export interface FataRomaneasca {",
        "  /** Numele familiei, cum il scrie `next/font` in CSS. */",
        "  familie: string;",
        '  stil: "normal" | "italic";',
        "  /** O greutate (`400`) sau intervalul unui font variabil (`100 900`). */",
        "  greutate: string;",
        "  /** Fisierul din `public/fonturi-ro/`. */",
        "  fisier: string;",
        "  /** Literele pe care le are fisierul, ca `unicode-range`. */",
        "  interval: string;",
        "}",
        "",
        "export const FETE_ROMANESTI: readonly FataRomaneasca[] = [",
    ]
    for familie, stil, greutate, iesire, interval in randuri:
        linii.append('  { familie: "%s", stil: "%s", greutate: "%s", fisier: "%s", interval: "%s" },' % (familie, stil, greutate, iesire, interval))
    linii += ["];", ""]
    io.open(LISTA, "w", encoding="utf-8", newline="\n").write("\n".join(linii))
    print("\n%d fete; latin-ext %d KB -> romanesc %d KB; lista: %s" % (len(randuri), total_inainte // 1024, total_dupa // 1024, os.path.relpath(LISTA, RAD)))


if __name__ == "__main__":
    main()
