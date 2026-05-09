import { Skeleton } from '@/components/ui/skeleton'

export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-16 w-16 rounded-2xl" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-20 rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
      </div>
    </div>
  )
}

export function CourseCardSkeleton() {
  return (
    <div className="border rounded-xl overflow-hidden">
      <Skeleton className="h-40 w-full rounded-none" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-8 w-full rounded-lg" />
      </div>
    </div>
  )
}

export function CoursePageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
        <div className="lg:col-span-2">
          <Skeleton className="aspect-video rounded-xl" />
          <div className="mt-4 space-y-2">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function LessonPlayerSkeleton() {
  return (
    <div className="space-y-6 max-w-4xl">
      <Skeleton className="aspect-video rounded-xl" />
      <div className="flex justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="flex justify-between">
        <Skeleton className="h-9 w-40 rounded-lg" />
        <Skeleton className="h-9 w-40 rounded-lg" />
      </div>
    </div>
  )
}

export function SettingsSkeleton() {
  return (
    <div className="flex gap-12 max-w-4xl">
      <div className="w-[200px] shrink-0 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-lg" />)}
      </div>
      <div className="flex-1 space-y-12">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <div className="space-y-3">
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
      <div className="h-10 border-b bg-zinc-50" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4 border-b last:border-0">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/5" />
          <Skeleton className="h-4 w-16 ml-auto" />
        </div>
      ))}
    </div>
  )
}

export function AdminMetricsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Skeleton className="lg:col-span-2 h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  )
}

export function BadgesSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-5 w-32" />
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    </div>
  )
}

export function ReferralSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-5 w-40" />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-9 w-full rounded-lg" />
    </div>
  )
}
