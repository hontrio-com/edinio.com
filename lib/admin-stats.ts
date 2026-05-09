import type { SupabaseClient } from '@supabase/supabase-js'

export function parseDateRange(period: string, fromParam?: string, toParam?: string) {
  const now = new Date()
  now.setHours(23, 59, 59, 999)

  let dateFrom: Date
  let dateTo: Date = new Date(now)

  if (period === 'custom' && fromParam && toParam) {
    dateFrom = new Date(fromParam)
    dateFrom.setHours(0, 0, 0, 0)
    dateTo = new Date(toParam)
    dateTo.setHours(23, 59, 59, 999)
  } else if (period === '7d') {
    dateFrom = new Date(Date.now() - 7 * 86400000)
  } else if (period === '30d') {
    dateFrom = new Date(Date.now() - 30 * 86400000)
  } else if (period === '1y') {
    dateFrom = new Date(Date.now() - 365 * 86400000)
  } else if (period === 'all') {
    dateFrom = new Date('2024-01-01')
  } else {
    dateFrom = new Date(Date.now() - 90 * 86400000)
  }

  dateFrom.setHours(0, 0, 0, 0)

  const durationMs = dateTo.getTime() - dateFrom.getTime()
  const prevDateTo = new Date(dateFrom.getTime() - 1)
  const prevDateFrom = new Date(prevDateTo.getTime() - durationMs)

  return {
    dateFrom,
    dateTo,
    prevDateFrom,
    prevDateTo,
    durationMs,
    diffDays: Math.ceil(durationMs / 86400000),
  }
}

export async function buildStatsData(
  supabase: SupabaseClient,
  period: string,
  fromParam?: string,
  toParam?: string,
) {
  const { dateFrom, dateTo, prevDateFrom, prevDateTo, durationMs, diffDays } =
    parseDateRange(period, fromParam, toParam)

  const fromISO = dateFrom.toISOString()
  const toISO = dateTo.toISOString()
  const prevFromISO = prevDateFrom.toISOString()
  const prevToISO = prevDateTo.toISOString()
  const groupByWeek = diffDays > 60

  const [
    { data: currentPurchases },
    { data: prevPurchases },
    { data: coursePurchases },
    { data: currentUsers },
    { data: prevUsers },
  ] = await Promise.all([
    supabase
      .from('purchases')
      .select('id, amount_paid, currency, purchased_at, course_id')
      .eq('status', 'completed')
      .gte('purchased_at', fromISO)
      .lte('purchased_at', toISO),

    supabase
      .from('purchases')
      .select('id, amount_paid, currency, purchased_at')
      .eq('status', 'completed')
      .gte('purchased_at', prevFromISO)
      .lte('purchased_at', prevToISO),

    supabase
      .from('purchases')
      .select('amount_paid, currency, course_id, courses(id, title_ro, slug)')
      .eq('status', 'completed')
      .gte('purchased_at', fromISO)
      .lte('purchased_at', toISO),

    supabase
      .from('profiles')
      .select('id, created_at, preferred_language')
      .gte('created_at', fromISO)
      .lte('created_at', toISO)
      .neq('role', 'admin'),

    supabase
      .from('profiles')
      .select('id, created_at')
      .gte('created_at', prevFromISO)
      .lte('created_at', prevToISO)
      .neq('role', 'admin'),
  ])

  const totalRevenue = currentPurchases?.reduce((s, p) => s + p.amount_paid, 0) ?? 0
  const totalSales = currentPurchases?.length ?? 0
  const avgPerSale = totalSales > 0 ? Math.round(totalRevenue / totalSales) : 0
  const newUsers = currentUsers?.length ?? 0

  const prevTotalRevenue = prevPurchases?.reduce((s, p) => s + p.amount_paid, 0) ?? 0
  const prevTotalSales = prevPurchases?.length ?? 0
  const prevAvgPerSale = prevTotalSales > 0 ? Math.round(prevTotalRevenue / prevTotalSales) : 0
  const prevNewUsers = prevUsers?.length ?? 0

  function trend(current: number, prev: number): number {
    if (prev === 0) return current > 0 ? 100 : 0
    return Math.round(((current - prev) / prev) * 100)
  }

  // Chart points
  const revenueByPeriod = new Map<string, { revenue: number; sales: number }>()
  currentPurchases?.forEach(p => {
    const d = new Date(p.purchased_at)
    let key: string
    if (groupByWeek) {
      const day = d.getDay()
      const monday = new Date(d)
      monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
      key = monday.toISOString().slice(0, 10)
    } else {
      key = p.purchased_at.slice(0, 10)
    }
    const existing = revenueByPeriod.get(key) ?? { revenue: 0, sales: 0 }
    revenueByPeriod.set(key, { revenue: existing.revenue + p.amount_paid, sales: existing.sales + 1 })
  })

  const chartPoints: { date: string; revenue: number; sales: number }[] = []
  const step = groupByWeek ? 7 : 1
  const cursor = new Date(dateFrom)
  while (cursor <= dateTo) {
    const key = cursor.toISOString().slice(0, 10)
    chartPoints.push({ date: key, ...(revenueByPeriod.get(key) ?? { revenue: 0, sales: 0 }) })
    cursor.setDate(cursor.getDate() + step)
  }

  // Course breakdown
  const courseMap = new Map<string, { courseId: string; title: string; slug: string; revenue: number; sales: number }>()
  ;(coursePurchases as any[])?.forEach(p => {
    const course = p.courses
    if (!course) return
    const existing = courseMap.get(course.id) ?? { courseId: course.id, title: course.title_ro, slug: course.slug, revenue: 0, sales: 0 }
    courseMap.set(course.id, { ...existing, revenue: existing.revenue + p.amount_paid, sales: existing.sales + 1 })
  })
  const courseBreakdown = Array.from(courseMap.values()).sort((a, b) => b.revenue - a.revenue)

  // Country breakdown (currency as proxy)
  const roRevenue = currentPurchases?.filter(p => p.currency === 'ron').reduce((s, p) => s + p.amount_paid, 0) ?? 0
  const enRevenue = currentPurchases?.filter(p => p.currency === 'eur').reduce((s, p) => s + p.amount_paid, 0) ?? 0
  const roSales = currentPurchases?.filter(p => p.currency === 'ron').length ?? 0
  const enSales = currentPurchases?.filter(p => p.currency === 'eur').length ?? 0

  const prevRoRevenue = prevPurchases?.filter(p => p.currency === 'ron').reduce((s, p) => s + p.amount_paid, 0) ?? 0
  const prevEnRevenue = prevPurchases?.filter(p => p.currency === 'eur').reduce((s, p) => s + p.amount_paid, 0) ?? 0
  const prevRoSales = prevPurchases?.filter(p => p.currency === 'ron').length ?? 0
  const prevEnSales = prevPurchases?.filter(p => p.currency === 'eur').length ?? 0

  return {
    period: { from: fromISO, to: toISO, diffDays, groupByWeek },
    current: { totalRevenue, totalSales, avgPerSale, newUsers, roRevenue, enRevenue, roSales, enSales },
    previous: { totalRevenue: prevTotalRevenue, totalSales: prevTotalSales, avgPerSale: prevAvgPerSale, newUsers: prevNewUsers, roRevenue: prevRoRevenue, enRevenue: prevEnRevenue, roSales: prevRoSales, enSales: prevEnSales },
    trends: {
      revenue: trend(totalRevenue, prevTotalRevenue),
      sales: trend(totalSales, prevTotalSales),
      avgPerSale: trend(avgPerSale, prevAvgPerSale),
      newUsers: trend(newUsers, prevNewUsers),
      roRevenue: trend(roRevenue, prevRoRevenue),
      enRevenue: trend(enRevenue, prevEnRevenue),
    },
    chartPoints,
    courseBreakdown,
  }
}
