import React from 'react';

export type StatusBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'violet';

interface StatusBadgeProps {
  children: React.ReactNode;
  tone?: StatusBadgeTone;
  className?: string;
}

const toneClasses: Record<StatusBadgeTone, string> = {
  neutral: 'border-[var(--av-color-border)] bg-[var(--av-color-bg-subtle)] text-[var(--av-color-text-muted)]',
  info: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200',
  warning: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200',
  danger: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200',
  violet: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-200',
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ children, tone = 'neutral', className = '' }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none ${toneClasses[tone]} ${className}`}>
    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
    {children}
  </span>
);

export default StatusBadge;
