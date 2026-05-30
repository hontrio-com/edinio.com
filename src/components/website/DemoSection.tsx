"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, ShieldCheck, Truck, RotateCcw, Phone,
  Star, ShoppingBag, Eye, ArrowLeft, Calendar, X, User, MapPin, Home,
  Banknote, Check, Zap,
} from "lucide-react";

const COLOR = "#1877F2";
const STORE = "Super Iluminat";
const SHIPPING = 20;

const IMAGES = [
  "/demo/ImaginePrincipala.webp",
  "/demo/ImagineSecundara1.webp",
  "/demo/ImagineSecundara2.webp",
];

const PRICE = 49;
const COMPARE = 99;
const DISCOUNT = Math.round((1 - PRICE / COMPARE) * 100);
const PRODUCT_NAME = "Lampa Solara Stradala \u2013 8 LED-uri Puternice, Panou Solar Integrat";

const SPECS = [
  { label: "Panou solar", value: "Integrat, incarcare automata" },
  { label: "LED-uri", value: "8 de mare putere" },
  { label: "Telecomanda", value: "Inclusa" },
  { label: "Senzor lumina", value: "Pornire automata la intuneric" },
  { label: "Rezistenta", value: "Waterproof, exterior" },
  { label: "Alimentare", value: "Autonoma, fara cabluri" },
  { label: "Dimensiune", value: "55 cm" },
];

const REVIEWS = [
  { name: "Mihai D.", text: "Lumina este foarte puternica si acopera o suprafata mare. Se incarca bine si functioneaza perfect in fiecare noapte." },
  { name: "Andrei P.", text: "Am montat doua in curte si sunt foarte multumit. Instalarea a durat doar cateva minute." },
  { name: "Cristina M.", text: "Raport calitate-pret excelent. Telecomanda este foarte utila, iar senzorul de lumina functioneaza impecabil." },
  { name: "George T.", text: "Produs exact ca in descriere. Materiale de calitate si lumina puternica pentru zona de acces din fata casei." },
  { name: "Daniela R.", text: "O solutie excelenta pentru iluminarea gradinii fara consum de energie electrica. Recomand cu incredere!" },
];

const JUDETE = [
  "Municipiul Bucuresti","Alba","Arad","Arges","Bacau","Bihor","Bistrita-Nasaud","Botosani",
  "Braila","Brasov","Buzau","Calarasi","Cluj","Constanta","Covasna","Dambovita","Dolj",
  "Galati","Giurgiu","Gorj","Harghita","Hunedoara","Ialomita","Iasi","Ilfov","Maramures",
  "Mehedinti","Mures","Neamt","Olt","Prahova","Salaj","Satu Mare","Sibiu","Suceava",
  "Teleorman","Timis","Tulcea","Vaslui","Valcea","Vrancea",
];

export function DemoSection() {
  const [slide, setSlide] = useState(0);
  const [viewers, setViewers] = useState(18);
  const [modalOpen, setModalOpen] = useState(false);
  const [success, setSuccess] = useState(false);
  const [selectedTier, setSelectedTier] = useState(0);
  const [prioritize, setPrioritize] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", county: "", city: "", address: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setViewers(18 + Math.floor(Math.random() * 10)); }, []);

  useEffect(() => {
    if (modalOpen) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % IMAGES.length), 4000);
    return () => clearInterval(t);
  }, [modalOpen]);

  const now = new Date();
  const minDate = new Date(now); minDate.setDate(minDate.getDate() + 2);
  const maxDate = new Date(now); maxDate.setDate(maxDate.getDate() + 4);
  const fmt = (d: Date) => d.toLocaleDateString("ro-RO", { day: "numeric", month: "long" });

  const TIERS = [
    { qty: 1, price: 49, badge: "" },
    { qty: 2, price: 89, badge: "Cel mai bun pret" },
    { qty: 3, price: 125, badge: "Cel mai bun pret" },
  ];
  const tier = TIERS[selectedTier];
  const subtotal = tier.price;
  const extraCost = prioritize ? 4.99 : 0;
  const total = subtotal + extraCost + SHIPPING;

  function validate() {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 3) e.name = "Minim 3 caractere";
    if (!/^(0)(7\d{8})$/.test(form.phone.trim())) e.phone = "Format: 07XXXXXXXX";
    if (!form.county) e.county = "Selectati judetul";
    if (form.city.trim().length < 2) e.city = "Introduceti orasul";
    if (form.address.trim().length < 10) e.address = "Minim 10 caractere";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setSuccess(true);
  }

  function resetDemo() {
    setSuccess(false);
    setModalOpen(false);
    setSelectedTier(0);
    setPrioritize(false);
    setForm({ name: "", phone: "", county: "", city: "", address: "" });
    setErrors({});
    scrollRef.current?.scrollTo({ top: 0 });
  }

  return (
    <section id="demo" className="py-20 lg:py-28 bg-muted/30 overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-2xl mx-auto text-center mb-12 lg:mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-semibold mb-5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            Demo interactiv
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Asa va arata magazinul tau
          </h2>
          <p className="text-lg text-muted-foreground">
            Exploreaza pagina de produs, da scroll si plaseaza o comanda de test.
          </p>
        </div>

        {/* Phone mockup */}
        <div className="flex justify-center">
          <div className="relative w-[310px] sm:w-[375px] h-[620px] sm:h-[740px] rounded-[44px] sm:rounded-[50px] border-[6px] sm:border-[7px] border-gray-900 bg-gray-900 shadow-2xl shadow-black/40 overflow-hidden">
            {/* Notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[110px] sm:w-[140px] h-[26px] sm:h-[32px] bg-gray-900 rounded-b-2xl z-50" />

            {/* Status bar */}
            <div className="relative h-[42px] sm:h-[48px] bg-white flex items-end justify-between px-6 sm:px-7 pb-1.5 z-40">
              <span className="text-[11px] font-semibold text-gray-900 tracking-tight">9:41</span>
              <div className="flex items-center gap-[5px]">
                {/* Signal bars */}
                <div className="flex items-end gap-[1.5px]">
                  <div className="w-[3px] h-[4px] rounded-[0.5px] bg-gray-900" />
                  <div className="w-[3px] h-[6px] rounded-[0.5px] bg-gray-900" />
                  <div className="w-[3px] h-[8px] rounded-[0.5px] bg-gray-900" />
                  <div className="w-[3px] h-[10px] rounded-[0.5px] bg-gray-900" />
                </div>
                {/* WiFi */}
                <svg width="13" height="10" viewBox="0 0 16 12" className="text-gray-900 ml-0.5">
                  <path d="M8 9.6a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4zM8 6c1.82 0 3.47.74 4.66 1.94a.6.6 0 01-.85.85A5.37 5.37 0 008 7.2a5.37 5.37 0 00-3.81 1.59.6.6 0 01-.85-.85A6.57 6.57 0 018 6zm0-3.6c2.8 0 5.34 1.14 7.17 2.98a.6.6 0 01-.85.85A9.17 9.17 0 008 3.6a9.17 9.17 0 00-6.32 2.63.6.6 0 01-.85-.85A10.37 10.37 0 018 2.4z" fill="currentColor" />
                </svg>
                {/* Battery */}
                <div className="flex items-center ml-0.5">
                  <div className="w-[22px] h-[10px] rounded-[2.5px] border-[1.5px] border-gray-900 relative">
                    <div className="absolute inset-[1.5px] rounded-[1px] bg-gray-900" style={{ width: "65%" }} />
                  </div>
                  <div className="w-[1.5px] h-[4px] rounded-r-sm bg-gray-900 ml-[0.5px]" />
                </div>
              </div>
            </div>

            {/* Scrollable content */}
            <div
              ref={scrollRef}
              className="bg-[#FAFAFA] overflow-y-auto overflow-x-hidden scrollbar-none"
              style={{ height: "calc(100% - 48px - 56px)" }}
            >
              {/* Store header */}
              <div className="bg-white border-b border-gray-100 px-3 h-10 flex items-center gap-1.5 sticky top-0 z-30">
                <ArrowLeft size={13} className="text-gray-400" />
                <span className="text-[11px] text-gray-400">Magazin</span>
                <span className="text-gray-300 text-[11px]">/</span>
                <span className="text-[11px] font-bold text-gray-900">{STORE}</span>
              </div>

              {/* Gallery */}
              <div className="px-3 pt-2 pb-1">
                <div className="relative aspect-square rounded-2xl bg-gray-50 overflow-hidden shadow-md">
                  <div className="flex h-full transition-transform duration-500 ease-in-out"
                    style={{ transform: `translateX(-${slide * 100}%)` }}>
                    {IMAGES.map((src, i) => (
                      <div key={i} className="relative w-full h-full flex-shrink-0">
                        <Image src={src} alt={`Lampa ${i + 1}`} fill className="object-contain p-2" sizes="375px" />
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => setSlide((slide - 1 + IMAGES.length) % IMAGES.length)}
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow z-10">
                    <ChevronLeft size={12} className="text-gray-700" />
                  </button>
                  <button type="button" onClick={() => setSlide((slide + 1) % IMAGES.length)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow z-10">
                    <ChevronRight size={12} className="text-gray-700" />
                  </button>
                  <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 z-10">
                    {IMAGES.map((_, i) => (
                      <button key={i} type="button" onClick={() => setSlide(i)}
                        className="rounded-full transition-all duration-300"
                        style={i === slide
                          ? { width: 16, height: 5, backgroundColor: COLOR }
                          : { width: 5, height: 5, backgroundColor: "rgba(0,0,0,0.15)" }} />
                    ))}
                  </div>
                  <div className="absolute top-2 left-2 bg-black/30 backdrop-blur-sm text-white text-[9px] font-medium px-1.5 py-0.5 rounded-full z-10">
                    {slide + 1} / {IMAGES.length}
                  </div>
                  <div className="absolute top-2 right-2 bg-amber-400 text-black text-[9px] font-black px-2 py-0.5 rounded-full shadow z-10">
                    -{DISCOUNT}%
                  </div>
                </div>
              </div>

              {/* Product info */}
              <div className="px-3 pt-3 pb-2 space-y-2.5">
                <div className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 w-fit">
                  <div className="flex">{[1,2,3,4,5].map(i => <Star key={i} size={9} className="text-amber-400 fill-amber-400" />)}</div>
                  <span className="text-[9px] font-semibold text-amber-800">Calitate verificata</span>
                </div>

                <h3 className="text-[15px] font-black text-gray-900 leading-tight">{PRODUCT_NAME}</h3>

                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Ilumineaza eficient orice spatiu exterior fara costuri la energie electrica! Echipata cu 8 LED-uri de mare putere, panou solar integrat si telecomanda.
                </p>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-2xl font-black text-gray-900">{PRICE} lei</span>
                  <span className="text-sm text-gray-400 line-through">{COMPARE} lei</span>
                  <span className="bg-amber-400 text-black text-[9px] font-black px-1.5 py-0.5 rounded-full">-{DISCOUNT}%</span>
                </div>

                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-2.5 py-2">
                  <Calendar size={13} className="text-green-600 flex-shrink-0" />
                  <div>
                    <p className="text-[11px] font-semibold text-green-800">Livrare estimata</p>
                    <p className="text-[10px] text-green-600">{fmt(minDate)} - {fmt(maxDate)}</p>
                  </div>
                </div>

                {/* CTA */}
                <div className="relative">
                  <div className="absolute inset-0 rounded-xl pointer-events-none"
                    style={{ backgroundColor: COLOR, animation: "demoPulse 1.2s ease-out infinite" }} />
                  <button type="button" onClick={() => { setModalOpen(true); setSuccess(false); }}
                    className="relative w-full py-3 text-[11px] font-bold text-white rounded-xl flex items-center justify-center gap-1.5 uppercase tracking-wide"
                    style={{ backgroundColor: COLOR, boxShadow: `0 4px 16px ${COLOR}55` }}>
                    <ShoppingBag size={14} />
                    Comanda acum - Plata la livrare
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5 py-0.5">
                  {[
                    { icon: ShieldCheck, text: "Plata la livrare" },
                    { icon: Truck, text: "Livrare 24-48h" },
                    { icon: RotateCcw, text: "Retur 14 zile" },
                  ].map(({ icon: Icon, text }) => (
                    <div key={text} className="flex flex-col items-center gap-0.5 text-center">
                      <Icon size={14} style={{ color: COLOR }} />
                      <span className="text-[9px] text-gray-500 font-medium leading-tight">{text}</span>
                    </div>
                  ))}
                </div>

                <div className="inline-flex items-center gap-1.5 bg-white border border-gray-100 shadow-sm rounded-full px-2.5 py-1 text-[10px] w-fit">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                  </span>
                  <Eye size={10} className="text-gray-500" />
                  <span className="text-gray-700">
                    <span className="font-bold text-gray-900">{viewers}</span> persoane se uita acum
                  </span>
                </div>
              </div>

              {/* Trust badges */}
              <div className="px-3 py-4 bg-white">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { icon: Truck, title: "Livrare 24-48h", desc: "Livrare rapida in toata Romania." },
                    { icon: ShieldCheck, title: "Plata la livrare", desc: "Platesti cash curierului." },
                    { icon: RotateCcw, title: "Retur 14 zile", desc: "Returneaza fara intrebari." },
                    { icon: Phone, title: "Suport dedicat", desc: "Disponibil oricand." },
                  ].map(({ icon: Icon, title, desc }) => (
                    <div key={title} className="flex flex-col items-center text-center gap-1 p-2.5 bg-white rounded-xl border border-gray-100 shadow-sm">
                      <div className="w-7 h-7 rounded-full bg-gray-50 flex items-center justify-center">
                        <Icon size={14} style={{ color: COLOR }} />
                      </div>
                      <p className="font-semibold text-gray-900 text-[10px]">{title}</p>
                      <p className="text-[9px] text-gray-500 leading-relaxed">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Specifications */}
              <div className="px-3 py-4">
                <div className="text-center mb-3">
                  <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-0.5">Detalii tehnice</p>
                  <p className="text-xs font-bold text-gray-900">Specificatii</p>
                </div>
                <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                  {SPECS.map((spec, i) => (
                    <div key={spec.label}
                      className={`flex items-center gap-2 px-3 py-2 text-[11px] ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"} ${i < SPECS.length - 1 ? "border-b border-gray-100" : ""}`}>
                      <span className="text-gray-500 w-24 shrink-0 font-medium">{spec.label}</span>
                      <span className="font-semibold text-gray-900">{spec.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reviews */}
              <div className="px-3 py-4 bg-white">
                <div className="text-center mb-3">
                  <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-0.5">Recenzii verificate</p>
                  <p className="text-xs font-bold text-gray-900">Ce spun clientii</p>
                </div>
                <div className="space-y-2">
                  {REVIEWS.map((r) => (
                    <div key={r.name} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
                      <div className="flex gap-0.5 mb-1.5">
                        {[1,2,3,4,5].map(i => <Star key={i} size={9} className="text-amber-400 fill-amber-400" />)}
                      </div>
                      <p className="text-[11px] text-gray-700 leading-relaxed mb-2">&ldquo;{r.text}&rdquo;</p>
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                          style={{ backgroundColor: COLOR }}>
                          {r.name[0]}
                        </div>
                        <span className="text-[10px] font-semibold text-gray-900">{r.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="bg-gray-900 px-3 py-4 text-center">
                <p className="text-gray-600 text-[9px]">
                  &copy; {new Date().getFullYear()} {STORE}. Creat cu{" "}
                  <span className="font-semibold" style={{ color: COLOR }}>Edinio</span>
                </p>
              </div>

              {/* Spacer for sticky bar */}
              <div className="h-14" />
            </div>

            {/* Sticky bottom bar */}
            {!modalOpen && (
              <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] px-3 py-2 z-30"
                style={{ paddingBottom: 20 }}>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-medium text-gray-500 truncate">{PRODUCT_NAME}</p>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-bold text-gray-900">{PRICE} lei</span>
                      <span className="text-[9px] text-gray-400 line-through">{COMPARE} lei</span>
                    </div>
                  </div>
                  <button type="button" onClick={() => { setModalOpen(true); setSuccess(false); }}
                    className="flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold text-white rounded-xl flex-shrink-0 uppercase tracking-wide"
                    style={{ backgroundColor: COLOR }}>
                    <ShoppingBag size={12} />
                    Comanda
                  </button>
                </div>
              </div>
            )}

            {/* Order modal */}
            {modalOpen && (
              <div className="absolute inset-0 z-40" style={{ top: 48 }}>
                <div className="absolute inset-0 bg-black/60" onClick={() => !success && setModalOpen(false)} />

                <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-[20px] overflow-y-auto"
                  style={{ maxHeight: "92%", border: `3px solid ${COLOR}`, borderBottom: 0 }}>

                  {success ? (
                    <div className="px-5 py-10 text-center">
                      <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center" style={{ backgroundColor: COLOR }}>
                        <Check size={32} className="text-white" />
                      </div>
                      <h3 className="text-lg font-black text-gray-900 mb-2">Comanda plasata!</h3>
                      <p className="text-xs text-gray-500 mb-6 leading-relaxed">
                        Aceasta a fost o demonstratie.<br />
                        Creeaza-ti propriul magazin online gratuit pe Edinio.
                      </p>
                      <Link href="/register"
                        className="inline-flex items-center justify-center gap-2 w-full py-3 text-sm font-bold text-white rounded-xl"
                        style={{ backgroundColor: "#1AB554" }}>
                        <Zap size={16} />
                        Creeaza-ti magazinul gratuit
                      </Link>
                      <button type="button" onClick={resetDemo}
                        className="mt-4 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                        Incearca din nou
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-center pt-2">
                        <div className="w-8 h-1 rounded-full bg-gray-200" />
                      </div>
                      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-gray-100">
                        <h3 className="text-sm font-black text-gray-900">Finalizeaza comanda</h3>
                        <button type="button" onClick={() => setModalOpen(false)} className="p-1 rounded-full hover:bg-gray-100">
                          <X size={15} className="text-gray-500" />
                        </button>
                      </div>

                      <form onSubmit={handleSubmit} className="px-4 pt-3 pb-5 space-y-2.5">
                        {/* Quantity tiers */}
                        <div className="space-y-1.5">
                          <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wide">Alege cantitatea</p>
                          {TIERS.map((t, i) => {
                            const selected = selectedTier === i;
                            const baseTotal = PRICE * t.qty;
                            const savings = baseTotal - t.price;
                            return (
                              <button key={i} type="button" onClick={() => setSelectedTier(i)}
                                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl border-2 transition-all text-left"
                                style={{ borderColor: selected ? COLOR : "#E5E7EB", background: selected ? `${COLOR}12` : "#fff" }}>
                                <div className="w-9 h-9 rounded-lg overflow-hidden border border-gray-200 shrink-0 bg-gray-50">
                                  <Image src={IMAGES[0]} alt="" width={36} height={36} className="w-full h-full object-contain p-0.5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-bold text-[10px] text-gray-900">
                                    {t.qty} x {t.qty === 1 ? "Lampa Solara" : "Lampi Solare"}
                                  </p>
                                  {t.badge ? (
                                    <span className="inline-block mt-0.5 text-white text-[8px] font-black px-1.5 py-px rounded"
                                      style={{ backgroundColor: COLOR }}>{t.badge}</span>
                                  ) : (
                                    <span className="text-[9px] text-gray-400">{t.price} lei / buc</span>
                                  )}
                                  {savings > 0 && (
                                    <p className="text-[8px] text-green-600 font-semibold">Economisesti {savings} lei</p>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="font-black text-sm text-gray-900">{t.price} lei</p>
                                  {savings > 0 && (
                                    <p className="text-[9px] text-gray-400 line-through">{baseTotal} lei</p>
                                  )}
                                </div>
                                <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                                  style={selected ? { borderColor: COLOR, backgroundColor: COLOR } : { borderColor: "#D1D5DB" }}>
                                  {selected && <Check size={8} className="text-white" strokeWidth={3} />}
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {/* Fields */}
                        {([
                          { key: "name", label: "Nume complet", icon: User, placeholder: "Prenume Nume", type: "text" },
                          { key: "phone", label: "Numar de telefon", icon: Phone, placeholder: "07XXXXXXXX", type: "tel" },
                        ] as const).map(f => (
                          <div key={f.key}>
                            <label className="block text-[10px] font-semibold text-gray-700 mb-0.5">{f.label} *</label>
                            <div className={`flex overflow-hidden rounded-lg border ${errors[f.key] ? "border-red-400" : "border-gray-200"}`}>
                              <span className="flex items-center justify-center w-7 bg-gray-50"><f.icon size={12} className="text-gray-500" /></span>
                              <input value={form[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                                placeholder={f.placeholder} type={f.type}
                                className="flex-1 px-2 py-1.5 text-[11px] text-gray-800 bg-white focus:outline-none placeholder:text-gray-400" />
                            </div>
                            {errors[f.key] && <p className="text-[9px] text-red-500 mt-0.5">{errors[f.key]}</p>}
                          </div>
                        ))}

                        <div>
                          <label className="block text-[10px] font-semibold text-gray-700 mb-0.5">Judet *</label>
                          <div className={`flex overflow-hidden rounded-lg border ${errors.county ? "border-red-400" : "border-gray-200"}`}>
                            <span className="flex items-center justify-center w-7 bg-gray-50"><MapPin size={12} className="text-gray-500" /></span>
                            <select value={form.county} onChange={e => setForm(f => ({ ...f, county: e.target.value }))}
                              className="flex-1 px-2 py-1.5 text-[11px] text-gray-800 bg-white focus:outline-none">
                              <option value="">Selecteaza judetul</option>
                              {JUDETE.map(j => <option key={j} value={j}>{j}</option>)}
                            </select>
                          </div>
                          {errors.county && <p className="text-[9px] text-red-500 mt-0.5">{errors.county}</p>}
                        </div>

                        <div>
                          <label className="block text-[10px] font-semibold text-gray-700 mb-0.5">Oras *</label>
                          <div className={`flex overflow-hidden rounded-lg border ${errors.city ? "border-red-400" : "border-gray-200"}`}>
                            <span className="flex items-center justify-center w-7 bg-gray-50"><MapPin size={12} className="text-gray-500" /></span>
                            <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                              placeholder="Oras / Localitate"
                              className="flex-1 px-2 py-1.5 text-[11px] text-gray-800 bg-white focus:outline-none placeholder:text-gray-400" />
                          </div>
                          {errors.city && <p className="text-[9px] text-red-500 mt-0.5">{errors.city}</p>}
                        </div>

                        <div>
                          <label className="block text-[10px] font-semibold text-gray-700 mb-0.5">Adresa *</label>
                          <div className={`flex overflow-hidden rounded-lg border ${errors.address ? "border-red-400" : "border-gray-200"}`}>
                            <span className="flex items-center justify-center w-7 bg-gray-50"><Home size={12} className="text-gray-500" /></span>
                            <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                              placeholder="Strada, nr., bloc, ap."
                              className="flex-1 px-2 py-1.5 text-[11px] text-gray-800 bg-white focus:outline-none placeholder:text-gray-400" />
                          </div>
                          {errors.address && <p className="text-[9px] text-red-500 mt-0.5">{errors.address}</p>}
                        </div>

                        {/* Prioritize extra */}
                        <button type="button" onClick={() => setPrioritize(!prioritize)}
                          className="w-full text-left rounded-xl border-2 border-dashed p-2 transition-all"
                          style={prioritize ? { borderColor: COLOR, backgroundColor: `${COLOR}08` } : { borderColor: "#D1D5DB" }}>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded flex items-center justify-center border-2 flex-shrink-0"
                              style={prioritize ? { borderColor: COLOR, backgroundColor: COLOR } : { borderColor: "#D1D5DB" }}>
                              {prioritize && <Check size={8} className="text-white" strokeWidth={3} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-semibold text-gray-900">Prioritizeaza comanda mea</p>
                              <p className="text-[8px] text-gray-500">Expediata inaintea celorlalte comenzi</p>
                            </div>
                            <span className="text-[10px] font-black flex-shrink-0" style={{ color: COLOR }}>+4.99 lei</span>
                          </div>
                        </button>

                        {/* Order summary */}
                        <div className="rounded-xl p-2.5 space-y-1 text-[10px] bg-gray-50 border border-gray-200">
                          <div className="flex justify-between text-gray-500">
                            <span>Produs ({tier.qty} buc)</span>
                            <span className="font-medium text-gray-900">{subtotal} lei</span>
                          </div>
                          {prioritize && (
                            <div className="flex justify-between text-gray-500">
                              <span>Prioritizare comanda</span>
                              <span className="font-medium text-gray-900">4.99 lei</span>
                            </div>
                          )}
                          <div className="flex justify-between text-gray-500">
                            <span>Transport</span>
                            <span className="font-medium text-gray-900">{SHIPPING} lei</span>
                          </div>
                          <div className="flex justify-between font-black text-xs border-t border-gray-200 pt-1.5">
                            <span>Total</span>
                            <span style={{ color: COLOR }}>{total.toFixed(2).replace(".00", "")} lei</span>
                          </div>
                        </div>

                        <button type="submit"
                          className="w-full flex items-center justify-center gap-2 py-2.5 font-bold text-[11px] text-white rounded-xl uppercase tracking-wide"
                          style={{ backgroundColor: COLOR, boxShadow: `0 2px 12px ${COLOR}55` }}>
                          <Banknote size={14} />
                          Plata la livrare - {total.toFixed(2).replace(".00", "")} lei
                        </button>
                        <p className="text-center text-[8px] text-gray-400">
                          Platesti cash curierului - Fara card necesar
                        </p>
                      </form>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Home indicator */}
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-24 h-[4px] rounded-full bg-gray-600 z-50" />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes demoPulse {
          0% { opacity: 0.6; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.08); }
        }
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </section>
  );
}
