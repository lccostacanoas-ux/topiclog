import React from "react";

export type ButtonVariant = "primary" | "secondary" | "outline" | "danger" | "success" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
  touchOptimized?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  isLoading = false,
  fullWidth = false,
  touchOptimized = true,
  icon,
  children,
  className = "",
  disabled,
  style,
  ...props
}) => {
  const variantClass = {
    primary: "btn--primary",
    secondary: "btn--secondary",
    outline: "btn--outline",
    danger: "btn--danger",
    success: "btn--success",
    ghost: "btn--ghost"
  }[variant];

  const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
    sm: { padding: "6px 12px", fontSize: "13px", minHeight: touchOptimized ? "44px" : "32px" },
    md: { padding: "10px 18px", fontSize: "14px", minHeight: touchOptimized ? "48px" : "40px" },
    lg: { padding: "14px 24px", fontSize: "16px", minHeight: touchOptimized ? "52px" : "48px" }
  };

  const combinedStyles: React.CSSProperties = {
    ...sizeStyles[size],
    width: fullWidth ? "100%" : undefined,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    fontWeight: 700,
    borderRadius: "var(--radius-sm)",
    transition: "all 0.15s ease",
    cursor: disabled || isLoading ? "not-allowed" : "pointer",
    opacity: disabled || isLoading ? 0.65 : 1,
    ...style
  };

  return (
    <button
      className={`btn ${variantClass} ${touchOptimized ? "btn--touch" : ""} ${className}`.trim()}
      style={combinedStyles}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      {...props}
    >
      {isLoading ? (
        <span
          style={{
            display: "inline-block",
            width: "16px",
            height: "16px",
            border: "2px solid currentColor",
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 0.75s linear infinite"
          }}
          aria-hidden="true"
        />
      ) : icon ? (
        <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center" }}>
          {icon}
        </span>
      ) : null}
      <span>{children}</span>
      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </button>
  );
};
