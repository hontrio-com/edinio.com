export default function Loading() {
  return (
    <div className="p-4 sm:p-6 max-w-2xl animate-pulse">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-8 w-8 bg-muted rounded-lg" />
        <div>
          <div className="h-5 w-36 bg-muted rounded mb-1" />
          <div className="h-3 w-64 bg-muted rounded" />
        </div>
      </div>
      <div className="space-y-4">
        <div className="h-32 bg-muted rounded-xl" />
        <div className="h-48 bg-muted rounded-xl" />
        <div className="h-24 bg-muted rounded-xl" />
      </div>
    </div>
  );
}
