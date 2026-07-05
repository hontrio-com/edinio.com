"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { X, Truck, Loader2, CalendarClock } from "lucide-react";
import { requestCargusPickupAction } from "@/lib/actions/cargus.actions";
import { Button } from "@/components/ui/button";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today if it's still morning, otherwise tomorrow; Sundays skipped. */
function defaultPickupDate(): string {
  const d = new Date();
  if (d.getHours() >= 15) d.setDate(d.getDate() + 1);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return toLocalDateString(d);
}

export function CargusPickupModal({
  open,
  onClose,
  businessId,
}: {
  open: boolean;
  onClose: () => void;
  businessId: string;
}) {
  const [pickupDate, setPickupDate] = useState(defaultPickupDate);
  const [firstHour, setFirstHour] = useState("10:00");
  const [secondHour, setSecondHour] = useState("17:00");
  const [submitting, setSubmitting] = useState(false);

  const selectedDay = useMemo(() => new Date(`${pickupDate}T12:00:00`), [pickupDate]);
  const isSunday = !Number.isNaN(selectedDay.getTime()) && selectedDay.getDay() === 0;

  const startHours = useMemo(() => {
    const list: string[] = [];
    for (let h = 8; h <= 17; h++) list.push(`${pad(h)}:00`);
    return list;
  }, []);
  const endHours = useMemo(() => {
    const startH = parseInt(firstHour, 10) || 8;
    const list: string[] = [];
    for (let h = startH + 1; h <= 19; h++) list.push(`${pad(h)}:00`);
    return list;
  }, [firstHour]);

  async function handleSubmit() {
    if (!pickupDate) return toast.error("Alege data ridicarii");
    if (isSunday) return toast.error("Cargus nu face ridicari duminica");
    if (!endHours.includes(secondHour)) return toast.error("Ora de sfarsit trebuie sa fie dupa ora de inceput");

    setSubmitting(true);
    const result = await requestCargusPickupAction(businessId, {
      pickupStart: `${pickupDate}T${firstHour}`,
      pickupEnd: `${pickupDate}T${secondHour}`,
    });
    setSubmitting(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(
        result.orderId
          ? `Comanda de ridicare Cargus validata (#${result.orderId})`
          : "Comanda de ridicare Cargus validata",
      );
      onClose();
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl border border-border shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <img src="/integrations/cargus.svg" alt="Cargus" className="h-5 w-auto" />
            <div>
              <p className="text-sm font-semibold text-foreground">Cheama curierul Cargus</p>
              <p className="text-xs text-muted-foreground">Validare comanda de ridicare</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-3 rounded-xl bg-info/5 border border-info/20 flex gap-2.5">
            <CalendarClock className="h-4 w-4 text-info flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              AWB-urile Cargus se aduna intr-o comanda deschisa pe punctul tau de ridicare.
              Comanda se valideaza automat la ora de inchidere (AutomaticEOD) setata in WebExpress,
              sau manual de aici. Daca punctul tau nu are AutomaticEOD, fara validare curierul nu vine.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Data ridicarii *</label>
            <input
              type="date"
              value={pickupDate}
              min={toLocalDateString(new Date())}
              onChange={e => setPickupDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
            />
            {isSunday && (
              <p className="text-xs text-destructive mt-1">Duminica nu se fac ridicari. Alege alta zi.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">De la ora *</label>
              <select
                value={firstHour}
                onChange={e => {
                  setFirstHour(e.target.value);
                  const startH = parseInt(e.target.value, 10) || 8;
                  if ((parseInt(secondHour, 10) || 0) <= startH) {
                    setSecondHour(`${pad(Math.min(startH + 1, 19))}:00`);
                  }
                }}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
              >
                {startHours.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Pana la ora *</label>
              <select
                value={secondHour}
                onChange={e => setSecondHour(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
              >
                {endHours.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>

          <Button onClick={handleSubmit} disabled={submitting || isSunday} size="lg" className="w-full">
            {submitting ? <Loader2 className="animate-spin" /> : <Truck />}
            {submitting ? "Se valideaza..." : "Valideaza ridicarea"}
          </Button>
        </div>
      </div>
    </div>
  );
}
