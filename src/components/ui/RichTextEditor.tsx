"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { useState, useCallback, useEffect, useRef } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Link2, Code,
  Undo, Redo, FileCode, ImagePlus, Loader2, Type,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Props {
  content: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  /**
   * Îngăduie poze în text.
   *
   * ⚠ OPȚIONAL DINADINS, ȘI IMPLICIT STINS. Componenta asta se folosește în
   * cinci locuri, iar patru dintre ele scriu text de COMERCIANT: descrieri de
   * produs, politici, blocuri de pagină, anunțuri. Toate trec la afișare prin
   * `lib/utils/sanitize-html.ts`, care aruncă `img` dinadins — o poză de pe alt
   * domeniu în textul unui comerciant e un pixel de urmărire cu alt nume.
   *
   * Aprins acolo, butonul ar fi lăsat oamenii să insereze poze care dispar în
   * tăcere la prima afișare. Blogul e singurul cu curățător propriu
   * (`lib/blog/curata.ts`), unde `img` e îngăduit de la gazdele noastre.
   */
  cuImagini?: boolean;
  /** Cum se urcă o poză aleasă. Cere `cuImagini`. */
  incarcaImagine?: (file: File) => Promise<string | null>;
  placeholder?: string;
}

function ToolbarBtn({
  onClick, active, title, children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={cn(
        "w-7 h-7 rounded flex items-center justify-center transition-colors flex-shrink-0",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-4 bg-border mx-0.5 flex-shrink-0" />;
}

export function RichTextEditor({
  content, onChange, disabled = false, placeholder,
  cuImagini = false, incarcaImagine,
}: Props) {
  const [htmlMode, setHtmlMode] = useState(false);
  const [rawHtml, setRawHtml] = useState(content);
  const [urcaPoza, setUrcaPoza] = useState(false);
  const alegePoza = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      /*
        ⚠ FĂRĂ NODUL ĂSTA, `<img>` NU LIPSEȘTE DOAR DIN BARĂ — SE ȘTERGE SINGUR.

        Schema ProseMirror nu poate ține ce nu cunoaște. `setContent` arunca
        eticheta, emitea o schimbare, iar `onUpdate` scria înapoi în formular
        HTML-ul FĂRĂ poză. Adică: o poză scrisă de mână în modul HTML dispărea
        la prima comutare înapoi, iar un articol care AVEA deja poze în bază le
        pierdea tăcut la simpla redeschidere în editor — următoarea salvare le
        ștergea și din bază.

        Se adaugă doar când e cerut, ca schema să rămână aceeași pentru textele
        de comerciant, unde pozele oricum n-ar trece de curățătorul lor.
      */
      ...(cuImagini ? [Image.configure({ HTMLAttributes: { class: "rounded-lg" } })] : []),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      /*
        ⚠ `rel` SI `target` SE STING AICI, EXPLICIT (04.09.2026).

        @tiptap/extension-link vine cu `target: "_blank"` si
        `rel: "noopener noreferrer nofollow"` IMPLICITE, iar `configure()` face
        merge adanc — deci setand doar `class` le pastram pe amandoua. Rezultatul:
        fiecare legatura scrisa din editor pleca stampilata cu `nofollow` si fila
        noua, INCLUSIV cele catre paginile noastre. Curatatorul le lasa sa treaca
        (nu atingea legaturile interne), deci regula „legatura interna ramane
        curata" era anulata inainte sa ajunga la el.

        `null` inseamna „nu emite atributul". Ce se pune pe legaturile din afara
        hotaraste `curataArticol` (`relPentruExtern`), la salvare — un singur loc,
        nu doua.
      */
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-primary underline", rel: null, target: null },
      }),
    ],
    content,
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "ProseMirror focus:outline-none px-4 py-3",
        ...(placeholder ? { "data-placeholder": placeholder } : {}),
      },
    },
    onUpdate({ editor }) {
      const html = editor.getHTML();
      setRawHtml(html);
      onChange(html);
    },
  });

  useEffect(() => {
    if (editor && !editor.isFocused) {
      const current = editor.getHTML();
      if (content !== current) editor.commands.setContent(content);
    }
  }, [content, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href ?? "";
    const url = window.prompt("Introdu URL-ul:", previous);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  }, [editor]);

  async function pozaAleasa(file: File) {
    if (!incarcaImagine || !editor) return;
    setUrcaPoza(true);
    const url = await incarcaImagine(file);
    setUrcaPoza(false);
    if (!url) return;

    /*
      ⚠ SE CERE TEXTUL ALTERNATIV, NU SE PUNE GOL.

      Aici scria `alt: ""` cu nota „autorul o scrie în pagină, unde vede poza".
      Nota era falsă: nu exista NICIUN loc unde s-o scrie, în afară de modul HTML
      brut. Deci fiecare poză pusă din editor intra în articol fără descriere, iar
      cine se folosește de un cititor de ecran auzea „imagine" și atât.

      Se cere ACUM, cât timp poza e proaspăt aleasă și omul știe ce e în ea. Cerut
      mai târziu, ar fi trebuit să se întoarcă și să se uite din nou.

      ⚠ ȘI SE POATE LĂSA GOL. O poză pur decorativă TREBUIE să aibă `alt=""`, nu
      o descriere: altfel cititorul de ecran citește cu voce tare un ornament.
      De aceea „Renunț" nu oprește punerea pozei, doar o lasă fără descriere.
    */
    const alt = window.prompt(
      "Ce se vede în poză? (o propoziție scurtă; lasă gol dacă e doar decor)",
      "",
    );
    editor.chain().focus().setImage({ src: url, alt: alt ?? "" }).run();
  }

  /**
   * Schimbă descrierea unei poze deja puse.
   *
   * Fără asta, o poză pusă în grabă cu descrierea greșită sau lipsă nu se mai
   * putea îndrepta decât în modul HTML — adică practic deloc.
   */
  const schimbaAlt = useCallback(() => {
    if (!editor) return;
    const acum = (editor.getAttributes("image").alt as string | undefined) ?? "";
    const alt = window.prompt("Ce se vede în poză? (lasă gol dacă e doar decor)", acum);
    if (alt === null) return;
    editor.chain().focus().updateAttributes("image", { alt }).run();
  }, [editor]);

  if (!editor) return null;

  function toggleHtmlMode() {
    if (htmlMode) {
      editor!.commands.setContent(rawHtml);
      onChange(rawHtml);
    } else {
      setRawHtml(editor!.getHTML());
    }
    setHtmlMode(!htmlMode);
  }

  return (
    <div className={cn(
      "border border-border rounded-xl overflow-hidden bg-background",
      disabled && "opacity-50 pointer-events-none"
    )}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/40 flex-wrap">
        {cuImagini && incarcaImagine && (
          <>
            <ToolbarBtn onClick={() => alegePoza.current?.click()} title="Pune o poza">
              {urcaPoza ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
            </ToolbarBtn>
            <input ref={alegePoza} type="file" accept="image/*" className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                /* Se goleste campul, altfel aceeasi poza aleasa a doua oara la
                   rand nu mai declanseaza nimic. */
                e.target.value = "";
                if (f) pozaAleasa(f);
              }} />
            {/* Se arată doar când e o poză aleasă: altfel ar fi un buton care nu
                face nimic, iar bara are deja destule. */}
            {editor.isActive("image") && (
              <ToolbarBtn onClick={schimbaAlt} title="Descrierea pozei (text alternativ)">
                <Type className="h-3.5 w-3.5" />
              </ToolbarBtn>
            )}
            <Sep />
          </>
        )}
        <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} title="Anuleaza">
          <Undo className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} title="Refă">
          <Redo className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <Sep />

        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Aldin">
          <Bold className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Cursiv">
          <Italic className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Subliniat">
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Taiat">
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")} title="Cod inline">
          <Code className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <Sep />

        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Titlu mare">
          <Heading1 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Titlu mediu">
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Titlu mic">
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <Sep />

        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Lista cu puncte">
          <List className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Lista numerotata">
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <Sep />

        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Aliniere stanga">
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Aliniere centru">
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Aliniere dreapta">
          <AlignRight className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <Sep />

        <ToolbarBtn onClick={setLink} active={editor.isActive("link")} title="Adauga link">
          <Link2 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <Sep />

        <ToolbarBtn onClick={toggleHtmlMode} active={htmlMode} title="Sursa HTML">
          <FileCode className="h-3.5 w-3.5" />
        </ToolbarBtn>
      </div>

      {/* Content */}
      {htmlMode ? (
        <textarea
          value={rawHtml}
          onChange={(e) => {
            setRawHtml(e.target.value);
            onChange(e.target.value);
          }}
          className="w-full px-4 py-3 text-xs font-mono bg-background text-foreground focus:outline-none resize-none min-h-[220px] leading-relaxed"
          spellCheck={false}
        />
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  );
}
