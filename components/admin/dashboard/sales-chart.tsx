'use client'

import { useEffect, useRef } from 'react'

interface SalesChartProps {
  data: { label: string; value: number }[]
}

export function SalesChart({ data }: SalesChartProps) {
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

      chartRef.current = new Chart(ctx!, {
        type: 'bar',
        data: {
          labels: data.map(d => d.label),
          datasets: [{
            label: 'Vânzări',
            data: data.map(d => d.value),
            backgroundColor: '#18181b',
            borderRadius: 6,
            borderSkipped: false,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#a1a1aa', font: { size: 11 } },
            },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(0,0,0,0.04)' },
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
  }, [data])

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5">
      <div className="mb-4">
        <p className="text-sm font-semibold text-zinc-900">Vânzări per curs</p>
        <p className="text-xs text-zinc-500 mt-0.5">Distribuție totală</p>
      </div>
      <div style={{ height: '200px', position: 'relative' }}>
        {data.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">
            Fără date
          </div>
        ) : (
          <canvas ref={canvasRef} />
        )}
      </div>
    </div>
  )
}
