import React from "react";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  label?: string;
  helperText?: string;
  error?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, helperText, error, prefix, suffix, id, className = "", style, ...props }, ref) => {
    const generatedId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="form-group" style={{ marginBottom: "16px" }}>
        {label && (
          <label htmlFor={generatedId} className="form-label">
            {label}
            {props.required && <span style={{ color: "var(--color-danger)", marginLeft: "4px" }}>*</span>}
          </label>
        )}
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          {prefix && (
            <div
              style={{
                position: "absolute",
                left: "12px",
                color: "var(--color-muted)",
                pointerEvents: "none",
                display: "flex",
                alignItems: "center"
              }}
            >
              {prefix}
            </div>
          )}
          <input
            id={generatedId}
            ref={ref}
            className={`form-control ${className}`.trim()}
            style={{
              paddingLeft: prefix ? "38px" : undefined,
              paddingRight: suffix ? "38px" : undefined,
              borderColor: error ? "var(--color-danger)" : undefined,
              ...style
            }}
            aria-invalid={!!error}
            aria-describedby={error ? `${generatedId}-error` : helperText ? `${generatedId}-help` : undefined}
            {...props}
          />
          {suffix && (
            <div
              style={{
                position: "absolute",
                right: "12px",
                color: "var(--color-muted)",
                pointerEvents: "none",
                display: "flex",
                alignItems: "center"
              }}
            >
              {suffix}
            </div>
          )}
        </div>
        {error ? (
          <p id={`${generatedId}-error`} className="form-error">
            {error}
          </p>
        ) : helperText ? (
          <p id={`${generatedId}-help`} className="form-help">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";
