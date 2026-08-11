import { ReactNode } from "react";

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  className?: string;
  disabled?: boolean;
}

export function Button({ children, onClick, type = "button", className = "", disabled = false }: ButtonProps) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-400 ${className}`}>
      {children}
    </button>
  );
}
