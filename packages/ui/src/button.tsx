import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "myform-btn--primary",
  secondary: "myform-btn--secondary",
  danger: "myform-btn--danger",
};

/** Shared button used by dashboard and public form pages. */
export function Button({ variant = "primary", className, type, ...rest }: ButtonProps) {
  const classes = ["myform-btn", VARIANT_CLASSES[variant], className].filter(Boolean).join(" ");
  return <button type={type ?? "button"} className={classes} {...rest} />;
}
