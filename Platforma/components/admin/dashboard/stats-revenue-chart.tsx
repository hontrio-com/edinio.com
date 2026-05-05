'use client'

import { useEffect, useRef } from 'react'

interface ChartPoint {
  date: string
  revenue: number
  sales: number
}

interface StatsRevenueChartProps {
  data: ChartPoint[]
  groupByWeek: boolean
  currency?: string
}

export function StatsRevenueChart({ data, groupByWeek, currency = 'RON' }: StatsRevenueChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<any>(null)

  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return

    async function init() {
      const { Chart, registerables } = await import('chart.js')
      Chart.register(...registerables)
      if (chartRef.current) chartRef.current.destroy()

      const labels = data.map(d =>
        new Date(d.date).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' })
      )

      chartRef.current = new Chart(ctx!, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: `Venit (${currency})`,
              data: data.map(d => Math.round(d.revenue / 100)),
              borderColor: '#18181b',
              backgroundColor: 'rgba(24,24,27,0.05)',
              borderWidth: 2,
              fill: true,
              tension: 0.4,
              pointRadius: data.length > 60 ? 0 : 3,
              pointHoverRadius: 5,
              pointBackgroundColor: '#18181b',
              yAxisID: 'y',
            },
            {
              label: 'Vânzări',
              data: data.map(d => d.sales),
              borderColor: '#a1a1aa',
              backgroundColor: 'transparent',
              borderWidth: 1.5,
              borderDash: [4, 4],
              fill: false,
              tension: 0.4,
              pointRadius: 0,
              pointHoverRadius: 4,
              yAxisID: 'y2',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#fff',
              borderColor: '#e4e4e7',
              borderWidth: 1,
              titleColor: '#18181b',
              bodyColor: '#71717a',
              padding: 10,
              callbacks: {
                label: (ctx) => {
                  if (ctx.datasetIndex === 0) {
                    return ` ${Math.round(ctx.parsed.y ?? 0).toLocaleString('ro-RO')} ${currency}`
                  }
                  return ` ${ctx.parsed.y ?? 0} vânzări`
                },
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#a1a1aa', font: { size: 11 }, maxRotation: 0, maxTicksLimit: 10, autoSkip: true },
            },
            y: {
              beginAtZero: true,
              position: 'left',
              grid: { color: 'rgba(0,0,0,0.04)' },
              ticks: {
                color: '#a1a1aa',
                font: { size: 11 },
                callback: (v: any) => `${Number(v).toLocaleString('ro-RO')} ${currency}`,
              },
            },
            y2: {
              beginAtZero: true,
              position: 'right',
              grid: { display: false },
              ticks: { color: '#a1a1aa', font: { size: 11 }, stepSize: 1 },
            },
          },
        },
      })
    }

    init()

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
    }
  }, [data, groupByWeek, currency])

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Evoluție venit</p>
          <p className="text-xs text-zinc-400 mt-0.5">
            {groupByWeek ? 'Grupat săptămânal' : 'Zilnic'} · {currency}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-0.5 bg-zinc-900 rounded" />
            Venit
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 border-t border-dashed border-zinc-400" />
            Vânzări
          </span>
        </div>
      </div>
      <div style={{ position: 'relative', width: '100%', height: '240px' }}>
        {data.length === 0 ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p className="text-sm text-zinc-400">Fără date pentru această perioadă</p>
          </div>
        ) : (
          <canvas ref={canvasRef} role="img" aria-label="Grafic evoluție venit în timp" />
        )}
      </div>
    </div>
  )
}
