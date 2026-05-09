'use client'

import { useEffect, useRef } from 'react'

interface RevenueDataPoint {
  date: string
  revenue: number
  sales: number
}

interface RevenueChartProps {
  data: RevenueDataPoint[]
  currency?: string
}

export function RevenueChart({ data, currency = 'RON' }: RevenueChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<any>(null)

  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    async function init() {
      const { Chart, registerables } = await import('chart.js')
      Chart.register(...registerables)

      if (chartRef.current) chartRef.current.destroy()

      const labels = data.map(d => {
        const date = new Date(d.date)
        return date.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' })
      })

      chartRef.current = new Chart(ctx!, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: `Venit (${currency})`,
              data: data.map(d => Math.round(d.revenue / 100)),
              borderColor: '#18181b',
              backgroundColor: 'rgba(24,24,27,0.04)',
              borderWidth: 2,
              fill: true,
              tension: 0.4,
              pointRadius: 3,
              pointHoverRadius: 5,
              pointBackgroundColor: '#18181b',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${Math.round(ctx.parsed.y ?? 0).toLocaleString('ro-RO')} ${currency}`,
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#a1a1aa', font: { size: 11 }, maxRotation: 0 },
            },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(0,0,0,0.04)' },
              ticks: {
                color: '#a1a1aa',
                font: { size: 11 },
                callback: (v) => `${Number(v).toLocaleString('ro-RO')} ${currency}`,
              },
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
  }, [data, currency])

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Venit - ultimele 30 zile</p>
          <p className="text-xs text-zinc-500 mt-0.5">Totaluri zilnice confirmate</p>
        </div>
      </div>
      <div style={{ height: '220px', position: 'relative' }}>
        {data.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">
            Fără date disponibile
          </div>
        ) : (
          <canvas ref={canvasRef} />
        )}
      </div>
    </div>
  )
}
