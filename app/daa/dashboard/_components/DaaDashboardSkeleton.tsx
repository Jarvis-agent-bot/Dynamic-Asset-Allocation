import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-4 w-[220px]" />
        <Skeleton className="h-3 w-[340px]" />
      </CardHeader>
      <CardContent className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[85%]" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function DaaDashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Card className="border-muted-foreground/20">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="space-y-2">
            <Skeleton className="h-4 w-[240px]" />
            <Skeleton className="h-3 w-[320px]" />
          </div>
          <Skeleton className="h-8 w-[120px]" />
        </CardContent>
      </Card>

      <SectionSkeleton rows={2} />
      <SectionSkeleton rows={3} />
      <SectionSkeleton rows={4} />
    </div>
  );
}
