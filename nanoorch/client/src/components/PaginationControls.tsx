import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

export default function PaginationControls({ page, totalPages, total, limit, onPageChange, isLoading }: PaginationControlsProps) {
  if (totalPages <= 1 && total <= limit) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border" data-testid="pagination-controls">
      <p className="text-sm text-muted-foreground">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline" size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || isLoading}
          data-testid="button-prev-page"
        >
          <ChevronLeft className="w-4 h-4" />
          Prev
        </Button>
        <span className="px-3 text-sm font-medium text-muted-foreground tabular-nums">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline" size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || isLoading}
          data-testid="button-next-page"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
