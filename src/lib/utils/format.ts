import { format as dateFnsFormat } from "date-fns";
import { ro } from "date-fns/locale";

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return dateFnsFormat(d, "d MMMM yyyy", { locale: ro });
}

export function formatDateShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return dateFnsFormat(d, "d MMM yyyy", { locale: ro });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return dateFnsFormat(d, "d MMMM yyyy, HH:mm", { locale: ro });
}

// Pretul ca numar formatat, fara sufixul " lei" (pentru capetele unui interval).
export function formatPriceValue(amount: number): string {
  if (amount >= 1000) {
    const parts = amount.toFixed(2).split(".");
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const decPart = parts[1] === "00" ? "" : `,${parts[1]}`;
    return `${intPart}${decPart}`;
  }
  return amount % 1 === 0 ? String(Math.floor(amount)) : amount.toFixed(2).replace(".", ",");
}

export function formatPrice(amount: number): string {
  return `${formatPriceValue(amount)} lei`;
}

// Afiseaza pretul unui produs variabil cu mai multe preturi.
// Implicit: interval "De la X – Y lei". Daca lowestOnly e true (sau exista un
// singur pret efectiv), afiseaza doar pretul minim "X lei".
export function formatPriceRange(min: number, max: number, lowestOnly = false): string {
  if (lowestOnly || max <= min) return formatPrice(min);
  return `De la ${formatPriceValue(min)} – ${formatPrice(max)}`;
}

export function formatPhoneDisplay(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("40") && cleaned.length === 11) {
    return `+4 0${cleaned.slice(2, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8)}`;
  }
  if (cleaned.length === 10 && cleaned.startsWith("0")) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
  }
  return phone;
}

export function whatsappLink(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("07") || cleaned.startsWith("0")) {
    return `https://wa.me/4${cleaned}`;
  }
  if (cleaned.startsWith("40")) {
    return `https://wa.me/${cleaned}`;
  }
  return `https://wa.me/${cleaned}`;
}
