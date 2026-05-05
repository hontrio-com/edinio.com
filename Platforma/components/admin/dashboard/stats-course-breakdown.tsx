'use client'

import { useEffect, useRef } from 'react'
import { formatPrice } from '@/lib/utils'

const COLORS = ['#18181b', '#52525b', '#a1a1aa', '#d4d4d8', '#e4e4e7']

interface CourseData {
  courseId: string
  title: string
  slug: string
  revenue: number
  sales: number
}

interface StatsCourseBreakdownProps {
  data: CourseData[]
  totalRevenue: number
}

export function StatsCourseBreakdown({ data, totalRevenue }: StatsCourseBreakdownProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<any>(null)

  const maxRevenue = data.length > 0 ? Math.max(...data.map(d => d.revenue)) : 1

  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return

    async function init() {
      const { Chart, registerables } = await import('chart.js')
      Chart.register(...registerables)
      if (chartRef.current) chartRef.current.destroy()

      chartRef.current = new Chart(ctx!, {
        type: 'doughnut',
        data: {
          labels: data.map(d => d.title),
          datasets: [{
            data: data.map(d => d.revenue),
            backgroundColor: data.map((_, i) => COLORS[i % COLORS.length]),
            borderWidth: 0,
            hoverOffset: 4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#fff',
              borderColor: '#e4e4e7',
              borderWidth: 1,
              titleColor: '#18181b',
              bodyColor: '#71717a',
              callbacks: {
                label: (ctx) => {
                  const val = ctx.raw as number
                  const pct = totalRevenue > 0 ? Math.round((val / totalRevenue) * 100) : 0
                  return ` ${Math.round(val / 100).toLocaleString('ro-RO')} RON (${pct}%)`
                },
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
  }, [data, totalRevenue])

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5">
      <div className="mb-4">
        <p className="text-sm font-semibold text-zinc-900">Breakdown per curs</p>
        <p className="text-xs text-zinc-400 mt-0.5">Venit și vânzări per produs</p>
      </div>

      {data.length === 0 ? (
        <div className="py-8 text-center text-sm text-zinc-400">Fără date</div>
      ) : (
        <div className="flex gap-4 items-start">
          <div style={{ position: 'relative', width: '100px', height: '100px', flexShrink: 0 }}>
            <canvas ref={canvasRef} role="img" aria-label="Distribuție venit per curs" />
          </div>

          <div className="flex-1 space-y-2.5">
            {data.map((course, i) => {
              const pct = totalRevenue > 0 ? Math.round((course.revenue / totalRevenue) * 100) : 0
              const barPct = maxRevenue > 0 ? Math.round((course.revenue / maxRevenue) * 100) : 0
              return (
                <div key={course.courseId}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: COLORS[i % COLORS.length] }}
                      />
                      <span className="text-xs text-zinc-700 truncate">{course.title}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-xs text-zinc-400">{course.sales} vânz.</span>
                      <span className="text-xs font-semibold text-zinc-900">
                        {formatPrice(course.revenue, 'ron')}
                      </span>
                      <span className="text-[10px] text-zinc-400 w-7 text-right">{pct}%</span>
                    </div>
                  </div>
                  <div className="h-1 bg-zinc-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${barPct}%`, background: COLORS[i % COLORS.length] }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
