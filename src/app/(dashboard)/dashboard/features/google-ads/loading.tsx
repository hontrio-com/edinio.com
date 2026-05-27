export default function GoogleAdsLoading() {
  return (
    <div className="p-6 max-w-2xl animate-pulse">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-8 w-8 bg-muted rounded" />
        <div>
          <div className="h-6 w-40 bg-muted rounded mb-1" />
          <div className="h-4 w-72 bg-muted rounded" />
        </div>
      </div>
      <div className="space-y-4">
        <div className="h-32 bg-muted rounded-xl" />
        <div className="h-40 bg-muted rounded-xl" />
        <div className="h-24 bg-muted rounded-xl" />
      </div>
    </div>
  );
}
