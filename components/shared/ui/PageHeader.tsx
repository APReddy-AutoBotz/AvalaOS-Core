import React from 'react';

export interface PageHeaderAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  primaryAction?: PageHeaderAction;
  secondaryActions?: PageHeaderAction[];
  meta?: React.ReactNode;
}

const PageHeader: React.FC<PageHeaderProps> = ({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryActions = [],
  meta,
}) => (
  <header className="av-page-header flex flex-col gap-4 border-b border-[var(--av-color-border)] pb-5 lg:flex-row lg:items-end lg:justify-between">
    <div className="min-w-0">
      {eyebrow && <p className="av-eyebrow">{eyebrow}</p>}
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--av-color-text)] sm:text-3xl">{title}</h1>
      {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--av-color-text-muted)]">{description}</p>}
    </div>
    {(meta || secondaryActions.length > 0 || primaryAction) && (
      <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 lg:justify-end">
        {meta}
        {secondaryActions.map(action => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.title}
            className="btn-ghost inline-flex min-h-10 items-center justify-center px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {action.label}
          </button>
        ))}
        {primaryAction && (
          <button
            type="button"
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
            title={primaryAction.title}
            className="btn-primary inline-flex min-h-10 items-center justify-center px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {primaryAction.label}
          </button>
        )}
      </div>
    )}
  </header>
);

export default PageHeader;
