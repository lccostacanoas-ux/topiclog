"use client";

import React, { useState } from "react";

export interface StarRatingDisplayProps {
  ratingAvg?: number | null;
  ratingCount?: number | null;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  onRate?: (stars: number) => void;
  label?: string;
  showBadgeWhenEmpty?: boolean;
}

/**
 * Componente oficial de avaliações em estrelas da TopicLog.
 * Exclusivamente estrelas (1 a 5), SEM comentários.
 * Quando o usuário não possui avaliações, exibe explicitamente: "Ainda sem avaliação".
 */
export function StarRatingDisplay({
  ratingAvg = 0,
  ratingCount = 0,
  size = "md",
  interactive = false,
  onRate,
  label,
  showBadgeWhenEmpty = true
}: StarRatingDisplayProps): React.JSX.Element {
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [selectedStar, setSelectedStar] = useState<number | null>(null);

  const starSize = size === "sm" ? "14px" : size === "lg" ? "24px" : "18px";
  const numCount = ratingCount ?? 0;
  const numAvg = ratingAvg ?? 0;

  const effectiveCount = numCount + (selectedStar ? 1 : 0);
  const effectiveAvg = selectedStar
    ? (numCount > 0 ? (numAvg * numCount + selectedStar) / (numCount + 1) : selectedStar)
    : numAvg;

  if (!interactive && effectiveCount === 0) {
    if (!showBadgeWhenEmpty) {
      return (
        <span style={{ fontSize: size === "sm" ? "11px" : "12px", color: "#94A3B8", fontStyle: "italic" }}>
          Ainda sem avaliação
        </span>
      );
    }
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          fontSize: size === "sm" ? "11px" : "12px",
          color: "#64748B",
          fontStyle: "italic",
          backgroundColor: "#F8FAFC",
          padding: "2px 8px",
          borderRadius: "6px",
          border: "1px solid #E2E8F0"
        }}
      >
        <span style={{ color: "#F59E0B", fontStyle: "normal" }}>⭐</span>
        <span>Ainda sem avaliação</span>
      </span>
    );
  }

  const currentDisplay = hoveredStar ?? selectedStar ?? Math.round(effectiveAvg);

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
      {label && (
        <span style={{ fontSize: size === "sm" ? "11px" : "12px", fontWeight: 700, color: "#475569" }}>
          {label}
        </span>
      )}
      <div
        style={{ display: "inline-flex", gap: "2px", alignItems: "center" }}
        aria-label={`Avaliação: ${effectiveAvg.toFixed(1)} de 5 estrelas`}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={!interactive}
            onClick={() => {
              if (interactive && onRate) {
                setSelectedStar(star);
                onRate(star);
              }
            }}
            onMouseEnter={() => interactive && setHoveredStar(star)}
            onMouseLeave={() => interactive && setHoveredStar(null)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              margin: 0,
              cursor: interactive ? "pointer" : "default",
              fontSize: starSize,
              color: star <= currentDisplay ? "#F59E0B" : "#CBD5E1",
              lineHeight: 1,
              transition: "transform 0.1s ease",
              transform: interactive && hoveredStar === star ? "scale(1.25)" : "scale(1)"
            }}
            title={interactive ? `Avaliar com ${star} estrela${star > 1 ? "s" : ""}` : undefined}
          >
            ★
          </button>
        ))}
      </div>
      {effectiveCount > 0 ? (
        <span style={{ fontSize: size === "sm" ? "11px" : "13px", fontWeight: 700, color: "#1E293B" }}>
          {effectiveAvg.toFixed(1)}{" "}
          <span style={{ fontSize: "11px", color: "#64748B", fontWeight: 500 }}>
            ({effectiveCount} {effectiveCount === 1 ? "avaliação" : "avaliações"})
          </span>
        </span>
      ) : (
        <span style={{ fontSize: "12px", color: "#94A3B8", fontStyle: "italic" }}>
          Ainda sem avaliação
        </span>
      )}
    </div>
  );
}
export default StarRatingDisplay;
