import React from "react";

export type BadgeVariant = "primary" | "success" | "warning" | "danger" | "neutral";
export type BadgeSize = "sm" | "md";

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = "primary",
  size = "md",
  icon,
  children,
  className = "",
  style
}) => {
  const variantClass = `badge--${variant}`;
  const sizeStyle: React.CSSProperties =
    size === "sm"
      ? { fontSize: "11px", padding: "2px 8px" }
      : { fontSize: "12px", padding: "4px 10px" };

  return (
    <span
      className={`badge ${variantClass} ${className}`.trim()}
      style={{ ...sizeStyle, ...style }}
    >
      {icon && (
        <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center" }}>
          {icon}
        </span>
      )}
      <span>{children}</span>
    </span>
  );
};
