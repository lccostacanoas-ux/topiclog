import React from "react";

export interface SkeletonProps {
  variant?: "text" | "card" | "avatar" | "custom";
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = "text",
  width,
  height,
  borderRadius,
  className = "",
  style
}) => {
  const variantClass = {
    text: "skeleton-text",
    card: "skeleton-card",
    avatar: "skeleton-avatar",
    custom: ""
  }[variant];

  const customStyle: React.CSSProperties = {
    width: width !== undefined ? width : undefined,
    height: height !== undefined ? height : undefined,
    borderRadius: borderRadius || undefined,
    ...style
  };

  return <div className={`skeleton ${variantClass} ${className}`.trim()} style={customStyle} aria-hidden="true" />;
};
