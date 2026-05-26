export default function Loading() {
  return (
    <div className="px-4 py-6 md:px-8 max-w-3xl mx-auto space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded-lg" />
      <div className="h-64 bg-muted rounded-xl" />
      <div className="h-40 bg-muted rounded-xl" />
      <div className="h-12 bg-muted rounded-xl" />
    </div>
  );
}
