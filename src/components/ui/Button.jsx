import React, { forwardRef } from 'react';

const VARIANTS = {
  primary: 'border-transparent bg-blue-600 text-white shadow-md shadow-blue-600/20 hover:bg-blue-700',
  secondary: 'border-slate-300/70 bg-white/75 text-slate-800 shadow-sm hover:border-blue-400 hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15',
  themed: 'shadow-sm',
  ghost: 'border-transparent bg-transparent text-current hover:bg-slate-500/10',
  danger: 'border-red-300/60 bg-red-50/80 text-red-700 hover:bg-red-100 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-300',
};

const SIZES = {
  sm: 'min-h-11 rounded-xl px-3 text-xs',
  md: 'min-h-11 rounded-xl px-4 text-sm',
  lg: 'min-h-12 rounded-2xl px-5 text-sm',
  icon: 'h-11 w-11 rounded-xl p-0',
};

export const Button = forwardRef(function Button({
  children,
  className = '',
  disabled = false,
  leadingIcon = null,
  loading = false,
  size = 'md',
  type = 'button',
  variant = 'secondary',
  ...props
}, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex shrink-0 items-center justify-center gap-2 border font-extrabold transition-[background-color,border-color,color,box-shadow,transform] duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant] || VARIANTS.secondary} ${SIZES[size] || SIZES.md} ${className}`}
      {...props}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
      ) : leadingIcon}
      {children}
    </button>
  );
});

export default Button;
