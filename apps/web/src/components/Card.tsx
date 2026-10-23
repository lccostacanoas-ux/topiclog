import React from "react";

export interface CardProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  interactive?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  action,
  footer,
  interactive = false,
  className = "",
  style,
  onClick
}) => {
  return (
    <div
      className={`card-modern ${interactive ? "card-interactive" : ""} ${className}`.trim()}
      style={style}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive && onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {(title || action) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "16px",
            gap: "12px"
          }}
        >
          <div>
            {typeof title === "string" ? (
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: 800,
                  margin: 0,
                  color: "var(--color-brand-deep-navy)",
                  lineHeight: 1.3
                }}
              >
                {title}
              </h3>
            ) : (
              title
            )}
            {subtitle && (
              <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--color-muted)" }}>
                {subtitle}
              </p>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}

      <div>{children}</div>

      {footer && (
        <div
          style={{
            marginTop: "16px",
            paddingTop: "14px",
            borderTop: "1px solid var(--color-border-subtle)"
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
};
