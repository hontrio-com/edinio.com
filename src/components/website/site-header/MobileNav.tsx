"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Phone } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  COMPETITORS,
  INDUSTRY_LINKS,
  RESOURCES,
  SOLUTION_COLUMNS,
  type MenuId,
} from "@/lib/website/nav";
import { MenuBadge, SUPPORT_PHONE, SUPPORT_PHONE_HREF } from "./MenuPieces";

/**
 * Meniul de telefon: panou pe tot ecranul, cu grupuri care se desfășoară.
 *
 * Nu reia mega menu-ul. Pe lățime mică, un panou cu patru coloane e ilizibil, așa
 * că grupurile devin acordeon și rămâne doar un grup deschis o dată — altfel
 * lista devine mai lungă decât răbdarea cuiva care caută Prețuri.
 */

const HEADER_H = "4.5rem"; /* 72px, cât bara de sus */

interface Props {
  open: boolean;
  onClose: () => void;
}

export function MobileNav({ open, onClose }: Props) {
  const [section, setSection] = useState<MenuId | null>(null);

  /* Blocăm derularea paginii cât panoul e deschis, ca să nu se miște dedesubt. */
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  /*
   * La închidere strângem grupurile, ca redeschiderea să pornească curat.
   * Ajustare în timpul randării, nu într-un efect: e o stare readusă la zero
   * pentru că s-a schimbat o valoare din afară (`open`).
   */
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setSection(null);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 overflow-y-auto overscroll-contain bg-white lg:hidden"
      style={{ top: HEADER_H }}
    >
      <div className="flex min-h-full flex-col px-5 pt-3 pb-8">
        <Group
          label="Soluție eCommerce"
          id="solutie"
          openSection={section}
          onToggle={setSection}
        >
          {SOLUTION_COLUMNS.flatMap((column) => column.items).map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 active:bg-tint-2"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-hairline bg-white">
                  <Icon className="h-4 w-4 text-ink-3" strokeWidth={1.75} />
                </span>
                <span className="text-[14px] font-medium text-ink">{item.label}</span>
                {item.badge ? <MenuBadge>{item.badge}</MenuBadge> : null}
              </Link>
            );
          })}

          <p className="px-2 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            Industrii
          </p>
          <div className="grid grid-cols-2 gap-x-2">
            {INDUSTRY_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                className="rounded-lg px-2 py-2 text-[13px] text-ink-2 active:bg-tint-2"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </Group>

        <Group label="De ce noi?" id="de-ce-noi" openSection={section} onToggle={setSection}>
          {COMPETITORS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className="flex items-center justify-between rounded-xl px-2 py-2.5 active:bg-tint-2"
            >
              <span className="text-[14px] font-medium text-ink">
                <span className="text-ink-3">Edinio vs </span>
                {item.name}
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-3" />
            </Link>
          ))}
        </Group>

        <PlainRow href="/#preturi" label="Prețuri" onClose={onClose} />

        <Group label="Resurse" id="resurse" openSection={section} onToggle={setSection}>
          {RESOURCES.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 active:bg-tint-2"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-hairline bg-white">
                  <Icon className="h-4 w-4 text-ink-3" strokeWidth={1.75} />
                </span>
                <span className="text-[14px] font-medium text-ink">{item.label}</span>
                {item.badge ? <MenuBadge>{item.badge}</MenuBadge> : null}
              </Link>
            );
          })}
        </Group>

        <PlainRow href="/contact" label="Contact" onClose={onClose} />

        {/* Acțiunile stau jos: degetul ajunge acolo, nu sus. */}
        <div className="mt-8 flex flex-col gap-2.5">
          <Link
            href="/register"
            onClick={onClose}
            className="flex h-12 items-center justify-center rounded-[8px] bg-primary text-[15px] font-semibold text-white"
          >
            Începe gratuit
          </Link>
          <Link
            href="/login"
            onClick={onClose}
            className="flex h-12 items-center justify-center rounded-[8px] border border-hairline text-[15px] font-medium text-ink"
          >
            Conectează-te
          </Link>
        </div>

        {/*
          Telefonul, sub butoane. Pe telefon e cea mai scurtă cale spre un om:
          `tel:` deschide apelul dintr-o apăsare. Numărul e ținut o singură dată,
          în `MenuPieces`, ca banda din mega menu și asta să nu se despartă.
        */}
        <div className="mt-7 flex flex-col items-center gap-2 border-t border-hairline pt-6">
          <span className="text-[13px] text-ink-2">Ai nevoie de ajutor?</span>
          <a
            href={SUPPORT_PHONE_HREF}
            className="flex items-center gap-2 rounded-full px-4 py-2 text-[17px] font-semibold text-ink active:bg-tint-2"
          >
            <Phone className="h-4 w-4 text-ink-3" strokeWidth={1.75} />
            {SUPPORT_PHONE}
          </a>
        </div>
      </div>
    </div>
  );
}

function Group({
  label,
  id,
  openSection,
  onToggle,
  children,
}: {
  label: string;
  id: MenuId;
  openSection: MenuId | null;
  onToggle: (next: MenuId | null) => void;
  children: React.ReactNode;
}) {
  const isOpen = openSection === id;
  return (
    <div className="border-b border-hairline">
      <button
        type="button"
        onClick={() => onToggle(isOpen ? null : id)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between py-4 text-left"
      >
        <span className="text-[16px] font-semibold text-ink">{label}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-ink-3 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>
      {isOpen ? <div className="pb-3">{children}</div> : null}
    </div>
  );
}

function PlainRow({
  href,
  label,
  onClose,
}: {
  href: string;
  label: string;
  onClose: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className="flex items-center justify-between border-b border-hairline py-4 text-[16px] font-semibold text-ink"
    >
      {label}
      <ArrowRight className="h-4 w-4 text-ink-3" />
    </Link>
  );
}
