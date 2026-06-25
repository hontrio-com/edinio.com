"use client";

import Link from "next/link";
import { AlertTriangle, Zap, Clock } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Props {
  planExpiresAt: string;
}

export function TrialBanner({ planExpiresAt }: Props) {
  const daysLeft = Math.ceil(
    (new Date(planExpiresAt).getTime() - Date.now()) / 86400000
  );
  const isExpired = daysLeft <= 0;
  const isUrgent = daysLeft <= 3;

  if (daysLeft > 15) return null;

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        isExpired
          ? "bg-destructive"
          : isUrgent
            ? "bg-gradient-to-r from-destructive to-warning"
            : "bg-primary"
      )}
    >
      <div className="px-4 py-3 sm:py-4 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-white text-center">
        {isExpired ? (
          <>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <p className="text-sm sm:text-base font-bold">
                Perioada de testare a expirat. Magazinul tau nu mai este vizibil clientilor.
              </p>
            </div>
            <Link
              href="/dashboard/settings#abonament"
              className="inline-flex items-center gap-2 px-5 py-2 bg-white text-destructive rounded-lg text-sm font-bold hover:bg-destructive/5 transition-colors flex-shrink-0"
            >
              <Zap className="h-4 w-4" />
              Alege un plan acum
            </Link>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 flex-shrink-0" />
              <p className="text-sm font-semibold">
                {isUrgent
                  ? `Doar ${daysLeft} ${daysLeft === 1 ? "zi ramasa" : "zile ramase"} din testarea gratuita!`
                  : `${daysLeft} ${daysLeft === 1 ? "zi ramasa" : "zile ramase"} din testarea gratuita`
                }
              </p>
            </div>
            <Link
              href="/dashboard/settings#abonament"
              className={cn(
                "inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-colors flex-shrink-0",
                isUrgent
                  ? "bg-white text-destructive hover:bg-destructive/5"
                  : "bg-white/20 hover:bg-white/30 text-white"
              )}
            >
              <Zap className="h-3.5 w-3.5" />
              Alege un plan
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
