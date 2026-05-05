import { createClient } from '@/lib/supabase/server'
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { AdminPageHeader } from '@/components/admin/shared/admin-page-header'
import { MetricCard } from '@/components/admin/dashboard/metric-card'
import { RevenueChart } from '@/components/admin/dashboard/revenue-chart'
import { SalesChart } from '@/components/admin/dashboard/sales-chart'
import { RecentActivity } from '@/components/admin/dashboard/recent-activity'
import { AdvancedStats } from '@/components/admin/dashboard/advanced-stats'
import { CircleDollarSign, TrendingUp, Users, BookOpen } from 'lucide-react'
import { formatPrice } from '@/lib/utils'

export const metadata = { title: 'Dashboard — Admin Edinio' }

interface Props {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}

async function DashboardData({ searchParams }: Props) {
  const supabase = await createClient()
  const { period = '90d', from, to } = await searchParams

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: allPurchases },
    { data: monthPurchases },
    { data: lastMonthPurchases },
    { count: totalUsers },
    { count: totalCourses },
    { count: publishedCourses },
    { data: recentPurchases },
    { data: courseSalesRaw },
  ] = await Promise.all([
    supabase.from('purchases').select('amount_paid, currency, purchased_at').eq('status', 'completed'),
    supabase.from('purchases').select('amount_paid, currency').eq('status', 'completed').gte('purchased_at', startOfMonth),
    supabase.from('purchases').select('amount_paid').eq('status', 'completed').gte('purchased_at', startOfLastMonth).lte('purchased_at', endOfLastMonth),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).neq('role', 'admin'),
    supabase.from('courses').select('*', { count: 'exact', head: true }),
    supabase.from('courses').select('*', { count: 'exact', head: true }).eq('is_published', true),
    supabase.from('purchases').select(`
      id, amount_paid, currency, purchased_at, status,
      profiles (email, full_name),
      courses (title_ro)
    `).eq('status', 'completed').order('purchased_at', { ascending: false }).limit(8),
    supabase.from('purchases').select('course_id, amount_paid, courses(title_ro)').eq('status', 'completed'),
  ])

  const totalRevenue = allPurchases?.reduce((s, p) => s + p.amount_paid, 0) ?? 0
  const monthRevenue = monthPurchases?.reduce((s, p) => s + p.amount_paid, 0) ?? 0
  const lastMonthRevenue = lastMonthPurchases?.reduce((s, p) => s + p.amount_paid, 0) ?? 0
  const revenueTrend = lastMonthRevenue > 0
    ? Math.round(((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
    : 0
  const totalSales = allPurchases?.length ?? 0
  const monthSales = monthPurchases?.length ?? 0

  const revenueByDay = new Map<string, number>()
  allPurchases?.filter(p => p.purchased_at >= thirtyDaysAgo).forEach(p => {
    const day = p.purchased_at.slice(0, 10)
    revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + p.amount_paid)
  })
  const revenueChartData = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86400000)
    const key = d.toISOString().slice(0, 10)
    return { date: key, revenue: revenueByDay.get(key) ?? 0, sales: 0 }
  })

  const salesByCourse = new Map<string, number>()
  courseSalesRaw?.forEach((p: any) => {
    const title = p.courses?.title_ro ?? 'Altele'
    salesByCourse.set(title, (salesByCourse.get(title) ?? 0) + 1)
  })
  const salesChartData = Array.from(salesByCourse.entries()).map(([label, value]) => ({
    label: label.length > 20 ? label.slice(0, 18) + '…' : label,
    value,
  }))

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Dashboard" description="Privire de ansamblu asupra platformei Edinio." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Venit total"
          value={formatPrice(totalRevenue, 'ron')}
          subtitle={`${totalSales} vânzări totale`}
          icon={CircleDollarSign}
          color="green"
        />
        <MetricCard
          title="Luna aceasta"
          value={formatPrice(monthRevenue, 'ron')}
          subtitle={`${monthSales} vânzări`}
          icon={TrendingUp}
          trend={{ value: revenueTrend, label: 'vs luna trecută' }}
          color="blue"
        />
        <MetricCard
          title="Utilizatori"
          value={(totalUsers ?? 0).toLocaleString('ro-RO')}
          subtitle="conturi active"
          icon={Users}
          color="purple"
        />
        <MetricCard
          title="Cursuri publicate"
          value={`${publishedCourses ?? 0} / ${totalCourses ?? 0}`}
          subtitle="din total cursuri"
          icon={BookOpen}
          color="orange"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <RevenueChart data={revenueChartData} currency="RON" />
        </div>
        <SalesChart data={salesChartData} />
      </div>

      <RecentActivity items={(recentPurchases as any) ?? []} />

      {/* Statistici avansate */}
      <div className="border-t border-zinc-200 pt-6">
        <Suspense fallback={<AdvancedStatsSkeleton />}>
          <AdvancedStats period={period} from={from} to={to} />
        </Suspense>
      </div>
    </div>
  )
}

function AdvancedStatsSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <div className="grid lg:grid-cols-2 gap-5">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Skeleton className="lg:col-span-2 h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  )
}

export default function AdminDashboardPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardData searchParams={searchParams} />
    </Suspense>
  )
}
