"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { X, Truck, Loader2, CalendarClock, Trash2 } from "lucide-react";
import { createFanCourierPickupAction, cancelFanCourierPickupAction } from "@/lib/actions/fancourier.actions";
import { Button } from "@/components/ui/button";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Tomorrow, skipping Sunday (FAN does not pick up on Sundays). */
function defaultPickupDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return toLocalDateString(d);
}

export function FanCourierPickupModal({
  open,
  onClose,
  businessId,
  lastPickupDate,
  lastPickupId,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  businessId: string;
  lastPickupDate?: string | null;
  lastPickupId?: string | null;
  onChanged: () => void;
}) {
  const [pickupDate, setPickupDate] = useState(defaultPickupDate);
  const [firstHour, setFirstHour] = useState("09:00");
  const [secondHour, setSecondHour] = useState("17:00");
  const [parcels, setParcels] = useState("1");
  const [weight, setWeight] = useState("1");
  const [observations, setObservations] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const minDate = defaultPickupDate();
  const selectedDay = useMemo(() => new Date(`${pickupDate}T12:00:00`), [pickupDate]);
  const isSunday = !Number.isNaN(selectedDay.getTime()) && selectedDay.getDay() === 0;
  const isSaturday = !Number.isNaN(selectedDay.getTime()) && selectedDay.getDay() === 6;

  // Pickup windows from the FAN docs: weekdays up to 19:00 (Bucharest) / 17:00
  // (province); Saturday 09:00-14:00. We offer the full weekday range and let
  // FAN validate the merchant's exact locality class.
  const lastHour = isSaturday ? 14 : 19;
  const startHours = useMemo(() => {
    const list: string[] = [];
    for (let h = 9; h <= lastHour - 2; h++) list.push(`${pad(h)}:00`);
    return list;
  }, [lastHour]);
  const endHours = useMemo(() => {
    const startH = parseInt(firstHour.slice(0, 2), 10) || 9;
    const list: string[] = [];
    for (let h = Math.max(startH + 2, 11); h <= lastHour; h++) list.push(`${pad(h)}:00`);
    return list;
  }, [firstHour, lastHour]);

  const hasActivePickup = !!lastPickupDate && lastPickupDate >= toLocalDateString(new Date());

  async function handleSubmit() {
    if (!pickupDate) return toast.error("Alege data ridicarii");
    if (isSunday) return toast.error("FAN Courier nu face ridicari duminica");
    if (pickupDate < minDate) return toast.error("Ridicarea se programeaza cel mai devreme pentru maine");
    const parcelsNum = parseInt(parcels) || 0;
    if (parcelsNum < 1) return toast.error("Numarul de colete trebuie sa fie minim 1");
    const weightNum = parseFloat(weight) || 0;
    if (weightNum <= 0) return toast.error("Greutatea totala trebuie sa fie mai mare decat 0");
    if (!endHours.includes(secondHour)) return toast.error("Intervalul de ridicare trebuie sa fie de minim 2 ore");

    setSubmitting(true);
    const result = await createFanCourierPickupAction(businessId, {
      pickupDate,
      firstHour,
      secondHour,
      parcels: parcelsNum,
      weightKg: weightNum,
      observations: observations.trim() || undefined,
    });
    setSubmitting(false);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(
        result.orderId
          ? `Ridicare programata (comanda #${result.orderId})`
          : "Ridicare programata cu succes",
      );
      onChanged();
      onClose();
    }
  }

  async function handleCancelPickup() {
    setCancelling(true);
    const result = await cancelFanCourierPickupAction(businessId);
    setCancelling(false);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success("Ridicarea programata a fost anulata");
      onChanged();
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl border border-border shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-background z-10">
          <div className="flex items-center gap-2.5">
            <img src="/integrations/fan-courier.svg" alt="FAN Courier" className="h-5 w-auto" />
            <div>
              <p className="text-sm font-semibold text-foreground">Cheama curierul</p>
              <p className="text-xs text-muted-foreground">Programare ridicare colete</p>
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
              AWB-ul singur nu este suficient: fara o ridicare programata, curierul nu vine dupa colete.
              O singura programare pe zi acopera toate AWB-urile din ziua respectiva.
            </p>
          </div>

          {hasActivePickup && (
            <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 space-y-2">
              <p className="text-xs font-medium text-warning">
                Ai deja o ridicare programata pentru {lastPickupDate}
                {lastPickupId ? ` (comanda #${lastPickupId})` : ""}.
              </p>
              {lastPickupId && (
                <button
                  type="button"
                  onClick={handleCancelPickup}
                  disabled={cancelling}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive hover:underline disabled:opacity-50"
                >
                  {cancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  {cancelling ? "Se anuleaza..." : "Anuleaza ridicarea existenta"}
                </button>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Data ridicarii *</label>
            <input
              type="date"
              value={pickupDate}
              min={minDate}
              onChange={e => {
                const value = e.target.value;
                setPickupDate(value);
                // Saturday window is 09:00-14:00 — clamp hours picked for a weekday.
                const d = new Date(`${value}T12:00:00`);
                if (!Number.isNaN(d.getTime()) && d.getDay() === 6) {
                  if ((parseInt(firstHour, 10) || 9) > 12) setFirstHour("12:00");
                  if ((parseInt(secondHour, 10) || 17) > 14) setSecondHour("14:00");
                }
              }}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
            />
            {isSunday && (
              <p className="text-xs text-destructive mt-1">Duminica nu se fac ridicari. Alege alta zi.</p>
            )}
            {isSaturday && (
              <p className="text-[11px] text-muted-foreground mt-1">Sambata ridicarile se fac intre 09:00 si 14:00.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">De la ora *</label>
              <select
                value={firstHour}
                onChange={e => {
                  setFirstHour(e.target.value);
                  const startH = parseInt(e.target.value.slice(0, 2), 10) || 9;
                  const minEnd = startH + 2;
                  if ((parseInt(secondHour.slice(0, 2), 10) || 0) < minEnd) {
                    setSecondHour(`${pad(Math.min(minEnd, lastHour))}:00`);
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
          <p className="text-[11px] text-muted-foreground -mt-2">
            Interval de minim 2 ore. Program ridicari: luni-vineri pana la 19:00 in Bucuresti, pana la 17:00 in provincie.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Nr. colete *</label>
              <input
                type="number"
                min="1"
                value={parcels}
                onChange={e => setParcels(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Greutate totala (kg) *</label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={weight}
                onChange={e => setWeight(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Observatii</label>
            <textarea
              value={observations}
              onChange={e => setObservations(e.target.value)}
              rows={2}
              placeholder="Ex: Ridicare de la receptie..."
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors resize-none"
            />
          </div>

          <Button onClick={handleSubmit} disabled={submitting || isSunday} size="lg" className="w-full">
            {submitting ? <Loader2 className="animate-spin" /> : <Truck />}
            {submitting ? "Se programeaza..." : "Programeaza ridicarea"}
          </Button>
        </div>
      </div>
    </div>
  );
}
