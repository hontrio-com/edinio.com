"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  ChevronLeft, ChevronRight, ShieldCheck, Truck, RotateCcw, Phone,
  Star, ShoppingBag, Eye, ArrowLeft, Calendar,
} from "lucide-react";

const BRAND_COLOR = "#1877F2";
const STORE_NAME = "Super Iluminat";

const IMAGES = [
  "/demo/ImaginePrincipala.webp",
  "/demo/ImagineSecundara1.webp",
  "/demo/ImagineSecundara2.webp",
];

const PRICE = 49;
const COMPARE_PRICE = 99;
const DISCOUNT = Math.round((1 - PRICE / COMPARE_PRICE) * 100);

const SPECS = [
  { label: "Panou solar", value: "Integrat, incarcare automata" },
  { label: "LED-uri", value: "8 LED-uri de mare putere" },
  { label: "Telecomanda", value: "Inclusa" },
  { label: "Senzor lumina", value: "Pornire automata la intuneric" },
  { label: "Rezistenta", value: "Waterproof, utilizare exterior" },
  { label: "Alimentare", value: "Autonoma, fara cabluri" },
  { label: "Dimensiune", value: "55 cm" },
];

const REVIEWS = [
  { name: "Mihai D.", text: "Lumina este foarte puternica si acopera o suprafata mare. Se incarca bine si functioneaza perfect in fiecare noapte." },
  { name: "Andrei P.", text: "Am montat doua in curte si sunt foarte multumit. Instalarea a durat doar cateva minute." },
  { name: "Cristina M.", text: "Raport calitate-pret excelent. Telecomanda este foarte utila, iar senzorul de lumina functioneaza impecabil." },
];

export function DemoSection() {
  const [slide, setSlide] = useState(0);
  const [viewers, setViewers] = useState(18);

  useEffect(() => { setViewers(18 + Math.floor(Math.random() * 10)); }, []);

  // Auto-advance gallery
  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % IMAGES.length), 4000);
    return () => clearInterval(t);
  }, []);

  const now = new Date();
  const minDate = new Date(now);
  minDate.setDate(minDate.getDate() + 2);
  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + 4);
  const fmt = (d: Date) => d.toLocaleDateString("ro-RO", { day: "numeric", month: "long" });

  return (
    <section className="py-20 lg:py-28 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-2xl mx-auto text-center mb-12 lg:mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-semibold mb-5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            Demo live
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Asa va arata magazinul tau
          </h2>
          <p className="text-lg text-muted-foreground">
            Pagina de produs completa, gata sa primeasca comenzi. Tu doar adaugi produsele.
          </p>
        </div>

        {/* Browser frame */}
        <div className="rounded-2xl border border-border bg-white shadow-2xl overflow-hidden max-w-5xl mx-auto">
          {/* Chrome bar */}
          <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-100 border-b border-gray-200">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
              <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
              <div className="w-3 h-3 rounded-full bg-[#28C840]" />
            </div>
            <div className="flex-1 flex justify-center">
              <div className="bg-white rounded-lg px-4 py-1.5 text-xs text-gray-500 border border-gray-200 w-full max-w-md text-center truncate">
                superiluminat.edinio.ro/lampa-solara-stradala
              </div>
            </div>
            <div className="w-[54px]" />
          </div>

          {/* Page content */}
          <div className="bg-[#FAFAFA]">
            {/* Store header */}
            <div className="bg-white border-b border-gray-100 px-4 md:px-8 h-11 flex items-center gap-2">
              <ArrowLeft size={14} className="text-gray-400" />
              <span className="text-xs text-gray-400">Magazin</span>
              <span className="text-gray-300 text-xs">/</span>
              <span className="text-xs font-bold text-gray-900">{STORE_NAME}</span>
            </div>

            {/* Product hero */}
            <div className="p-4 md:p-8">
              <div className="grid md:grid-cols-2 gap-6 md:gap-10 items-start">
                {/* Gallery */}
                <div>
                  <div className="relative aspect-square rounded-2xl bg-gray-50 overflow-hidden shadow-lg">
                    {IMAGES.map((src, i) => (
                      <div key={i} className="absolute inset-0 transition-opacity duration-700"
                        style={{ opacity: i === slide ? 1 : 0 }}>
                        <Image src={src} alt={`Lampa solara ${i + 1}`} fill
                          className="object-contain p-3" sizes="(max-width: 768px) 100vw, 40vw" />
                      </div>
                    ))}

                    <button type="button" onClick={() => setSlide((slide - 1 + IMAGES.length) % IMAGES.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-md z-10">
                      <ChevronLeft size={14} className="text-gray-700" />
                    </button>
                    <button type="button" onClick={() => setSlide((slide + 1) % IMAGES.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-md z-10">
                      <ChevronRight size={14} className="text-gray-700" />
                    </button>

                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
                      {IMAGES.map((_, i) => (
                        <button key={i} type="button" onClick={() => setSlide(i)}
                          className="rounded-full transition-all duration-300"
                          style={i === slide
                            ? { width: 20, height: 6, backgroundColor: BRAND_COLOR }
                            : { width: 6, height: 6, backgroundColor: "rgba(0,0,0,0.15)" }} />
                      ))}
                    </div>

                    <div className="absolute top-3 left-3 bg-black/30 backdrop-blur-sm text-white text-[10px] font-medium px-2 py-0.5 rounded-full z-10">
                      {slide + 1} / {IMAGES.length}
                    </div>
                    <div className="absolute top-3 right-3 bg-amber-400 text-black text-[10px] font-black px-2.5 py-1 rounded-full shadow z-10">
                      -{DISCOUNT}%
                    </div>
                  </div>

                  {/* Thumbnails (desktop) */}
                  <div className="hidden md:flex gap-2 mt-2">
                    {IMAGES.map((src, i) => (
                      <button key={i} type="button" onClick={() => setSlide(i)}
                        className="relative flex-1 aspect-square rounded-lg overflow-hidden transition-all"
                        style={{ border: `2px solid ${i === slide ? BRAND_COLOR : "transparent"}`, opacity: i === slide ? 1 : 0.5 }}>
                        <Image src={src} alt="" fill className="object-contain p-1" sizes="80px" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Info */}
                <div className="flex flex-col gap-3">
                  {/* Rating */}
                  <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 w-fit">
                    <div className="flex">{[1,2,3,4,5].map(i => <Star key={i} size={10} className="text-amber-400 fill-amber-400" />)}</div>
                    <span className="text-[10px] font-semibold text-amber-800">Calitate verificata</span>
                  </div>

                  {/* Title */}
                  <h3 className="text-base sm:text-lg md:text-xl font-black text-gray-900 leading-tight">
                    Lampa Solara Stradala &ndash; 8 LED-uri Puternice, Panou Solar Integrat
                  </h3>

                  {/* Description */}
                  <p className="text-[11px] sm:text-xs text-gray-500 leading-relaxed">
                    Ilumineaza eficient orice spatiu exterior fara costuri la energie electrica! Echipata cu 8 LED-uri de mare putere, panou solar integrat, senzor inteligent de lumina si telecomanda.
                  </p>

                  {/* Price */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-2xl md:text-3xl font-black text-gray-900">{PRICE} lei</span>
                    <span className="text-sm text-gray-400 line-through">{COMPARE_PRICE} lei</span>
                    <span className="bg-amber-400 text-black text-[10px] font-black px-2 py-0.5 rounded-full">-{DISCOUNT}%</span>
                  </div>

                  {/* Delivery estimate */}
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                    <Calendar size={14} className="text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-green-800">Livrare estimata</p>
                      <p className="text-[11px] text-green-600">{fmt(minDate)} - {fmt(maxDate)}</p>
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="relative">
                    <div className="absolute inset-0 rounded-xl"
                      style={{ backgroundColor: BRAND_COLOR, animation: "demoPulse 1.2s ease-out infinite" }} />
                    <button type="button"
                      className="relative w-full py-3 text-xs sm:text-sm font-bold text-white rounded-xl flex items-center justify-center gap-2 uppercase tracking-wide"
                      style={{ backgroundColor: BRAND_COLOR, boxShadow: `0 4px 16px ${BRAND_COLOR}55` }}>
                      <ShoppingBag size={15} />
                      Comanda acum - Plata la livrare
                    </button>
                  </div>

                  {/* Trust mini */}
                  <div className="grid grid-cols-3 gap-2 py-1">
                    {[
                      { icon: ShieldCheck, text: "Plata la livrare" },
                      { icon: Truck, text: "Livrare 24-48h" },
                      { icon: RotateCcw, text: "Retur 14 zile" },
                    ].map(({ icon: Icon, text }) => (
                      <div key={text} className="flex flex-col items-center gap-1 text-center">
                        <Icon size={16} style={{ color: BRAND_COLOR }} />
                        <span className="text-[10px] text-gray-500 font-medium leading-tight">{text}</span>
                      </div>
                    ))}
                  </div>

                  {/* Social proof */}
                  <div className="inline-flex items-center gap-2 bg-white border border-gray-100 shadow-sm rounded-full px-3 py-1.5 text-[11px] w-fit">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                    <Eye size={12} className="text-gray-500" />
                    <span className="text-gray-700">
                      <span className="font-bold text-gray-900">{viewers}</span> persoane se uita acum
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Trust badges */}
            <div className="px-4 md:px-8 pb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                {[
                  { icon: Truck, title: "Livrare 24-48h", desc: "Livrare rapida in toata Romania." },
                  { icon: ShieldCheck, title: "Plata la livrare", desc: "Platesti cash curierului." },
                  { icon: RotateCcw, title: "Retur 14 zile", desc: "Returneaza fara intrebari." },
                  { icon: Phone, title: "Suport dedicat", desc: "Disponibil pentru orice intrebare." },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="flex flex-col items-center text-center gap-1.5 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                    <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center">
                      <Icon size={16} style={{ color: BRAND_COLOR }} />
                    </div>
                    <p className="font-semibold text-gray-900 text-[11px]">{title}</p>
                    <p className="text-[10px] text-gray-500 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Specifications */}
            <div className="px-4 md:px-8 pb-6">
              <div className="text-center mb-4">
                <p className="text-[10px] uppercase tracking-widest text-gray-400 font-mono mb-1">Detalii tehnice</p>
                <p className="text-sm font-bold text-gray-900">Specificatii</p>
              </div>
              <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm max-w-2xl mx-auto">
                {SPECS.map((spec, i) => (
                  <div key={spec.label}
                    className={`flex items-center gap-3 px-4 py-2.5 text-xs ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"} ${i < SPECS.length - 1 ? "border-b border-gray-100" : ""}`}>
                    <span className="text-gray-500 w-28 shrink-0 font-medium">{spec.label}</span>
                    <span className="font-semibold text-gray-900">{spec.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Reviews */}
            <div className="px-4 md:px-8 pb-8">
              <div className="text-center mb-4">
                <p className="text-[10px] uppercase tracking-widest text-gray-400 font-mono mb-1">Recenzii verificate</p>
                <p className="text-sm font-bold text-gray-900">Ce spun clientii</p>
              </div>
              <div className="grid sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
                {REVIEWS.map((r) => (
                  <div key={r.name} className="bg-white border border-gray-100 rounded-xl p-3 sm:p-4 shadow-sm">
                    <div className="flex gap-0.5 mb-2">
                      {[1,2,3,4,5].map(i => <Star key={i} size={10} className="text-amber-400 fill-amber-400" />)}
                    </div>
                    <p className="text-[11px] text-gray-700 leading-relaxed mb-3">&ldquo;{r.text}&rdquo;</p>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                        style={{ backgroundColor: BRAND_COLOR }}>
                        {r.name[0]}
                      </div>
                      <span className="text-[11px] font-semibold text-gray-900">{r.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer mini */}
            <div className="bg-gray-900 px-4 md:px-8 py-5 text-center">
              <p className="text-gray-600 text-[10px]">
                &copy; {new Date().getFullYear()} {STORE_NAME}. Creat cu{" "}
                <span className="font-semibold" style={{ color: BRAND_COLOR }}>Edinio</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pulse animation for CTA */}
      <style>{`
        @keyframes demoPulse {
          0% { opacity: 0.6; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.08); }
        }
      `}</style>
    </section>
  );
}
