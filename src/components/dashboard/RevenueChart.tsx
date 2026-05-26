"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { formatPrice } from "@/lib/utils/format";

export type ChartDay = {
  label: string;
  revenue: number;
  orders: number;
};

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; name: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-xl px-3.5 py-2.5 shadow-lg">
      <p className="text-xs text-muted-foreground mb-1.5 font-medium">{label}</p>
      <p className="text-sm font-bold text-foreground">{formatPrice(payload[0].value)}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{payload[1]?.value ?? 0} comenzi</p>
    </div>
  );
}

export function RevenueChart({ data }: { data: ChartDay[] }) {
  const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
  const hasData = data.some(d => d.revenue > 0);

  return (
    <div className="w-full h-48">
      {!hasData ? (
        <div className="h-full flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Nu exista vanzari in ultimele 7 zile</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-primary, #1AB554)" stopOpacity={0.15} />
                <stop offset="95%" stopColor="var(--color-primary, #1AB554)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground, #6b7280)" }}
              axisLine={false}
              tickLine={false}
              dy={6}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground, #6b7280)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => v === 0 ? "0" : `${Math.round(v / 1000)}k`}
              domain={[0, Math.ceil(maxRevenue * 1.2)]}
              width={36}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--color-border, #e5e7eb)", strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="var(--color-primary, #1AB554)"
              strokeWidth={2}
              fill="url(#revenueGradient)"
            />
            <Area
              type="monotone"
              dataKey="orders"
              stroke="transparent"
              fill="transparent"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
