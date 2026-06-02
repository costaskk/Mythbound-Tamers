import React from "react";

export function Button({
  className = "",
  variant = "default",
  disabled = false,
  children,
  ...props
}) {
  const base =
    "inline-flex items-center justify-center px-4 py-2 font-semibold transition disabled:pointer-events-none disabled:opacity-50";
  const style =
    variant === "secondary"
      ? "bg-white/10 hover:bg-white/20 text-white border border-white/10"
      : "bg-cyan-300 hover:bg-cyan-200 text-slate-950";

  return (
    <button
      className={`${base} ${style} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}