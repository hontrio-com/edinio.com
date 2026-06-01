"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const STEPS = [
  { number: 1, label: "Informatii", shortLabel: "Info" },
  { number: 2, label: "Personalizare", shortLabel: "Design" },
  { number: 3, label: "Alege planul", shortLabel: "Plan" },
];

export function OnboardingProgress({ currentStep }: { currentStep: number }) {
  const progressPct = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="mb-8 select-none">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Pasul {currentStep} din {STEPS.length}
        </span>
        <span className="text-xs font-semibold text-primary">
          {STEPS[currentStep - 1]?.label}
        </span>
      </div>

      {/* Segmented bars */}
      <div className="flex gap-2">
        {STEPS.map((step) => {
          const isDone = currentStep > step.number;
          const isActive = currentStep === step.number;
          return (
            <div key={step.number} className="flex-1 relative h-1.5 rounded-full overflow-hidden bg-border">
              {(isDone || isActive) && (
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Dots + labels (desktop) */}
      <div className="hidden sm:flex items-center justify-between mt-3">
        {STEPS.map((step) => {
          const isDone = currentStep > step.number;
          const isActive = currentStep === step.number;
          return (
            <div key={step.number} className="flex items-center gap-1.5">
              <div
                className={cn(
                  "w-4 h-4 rounded-full flex items-center justify-center transition-all duration-300",
                  isDone ? "bg-primary" : isActive ? "bg-primary ring-4 ring-primary/20" : "bg-border"
                )}
              >
                {isDone && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
              </div>
              <span className={cn("text-xs font-medium", isActive ? "text-foreground" : "text-muted-foreground")}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
