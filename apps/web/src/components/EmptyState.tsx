import React from "react";
import Link from "next/link";

interface EmptyStateProps {
  readonly icon?: string;
  readonly title: string;
  readonly description: string;
  readonly actionLabel?: string;
  readonly actionHref?: string;
  readonly onActionClick?: () => void;
}

export function EmptyState({
  icon = "📦",
  title,
  description,
  actionLabel,
  actionHref,
  onActionClick
}: EmptyStateProps): React.JSX.Element {
  return (
    <div className="empty-state" role="status" aria-live="polite">
      <div className="empty-state__icon" aria-hidden="true">
        {icon}
      </div>
      <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>{title}</h3>
      <p style={{ color: "var(--color-muted)", fontSize: "14px", maxWidth: "460px", margin: "0 auto 16px auto" }}>
        {description}
      </p>
      {actionLabel && actionHref && (
        <Link href={actionHref} className="btn btn--primary">
          {actionLabel}
        </Link>
      )}
      {actionLabel && !actionHref && onActionClick && (
        <button type="button" onClick={onActionClick} className="btn btn--primary">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
