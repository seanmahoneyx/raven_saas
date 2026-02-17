import { Skeleton } from './skeleton'

interface TableSkeletonProps {
  columns?: number
  rows?: number
  showSearch?: boolean
}

export function TableSkeleton({ columns = 5, rows = 8, showSearch = true }: TableSkeletonProps) {
  return (
    <div className="space-y-4">
      {/* Search bar skeleton */}
      {showSearch && (
        <Skeleton className="h-9 w-[280px]" />
      )}

      {/* Table skeleton */}
      <div className="rounded-md border border-border">
        {/* Header row */}
        <div className="flex gap-4 border-b border-border bg-muted/50 px-4 py-3">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-4" style={{ width: `${100 / columns}%` }} />
          ))}
        </div>

        {/* Data rows */}
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={rowIdx} className="flex gap-4 border-b border-border last:border-0 px-4 py-3">
            {Array.from({ length: columns }).map((_, colIdx) => (
              <Skeleton
                key={colIdx}
                className="h-4"
                style={{ width: `${Math.random() * 30 + 40}%` }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Pagination skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-[100px]" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-[80px]" />
          <Skeleton className="h-8 w-[80px]" />
        </div>
      </div>
    </div>
  )
}
