import React, { useEffect, useId, useRef } from 'react';
import { XIcon } from './icons';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    size?: 'md' | 'lg' | 'xl';
    contentClassName?: string;
}

const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const modalSizeClass = {
    md: 'max-w-2xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
} as const;

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md', contentClassName }) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const titleId = useId();

    useEffect(() => {
        if (!isOpen) return;
        const previousFocus = document.activeElement as HTMLElement | null;
        const focusable = (): HTMLElement[] => Array.from(modalRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
        queueMicrotask(() => focusable()[0]?.focus());

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;
            const items = focusable();
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        const handleClickOutside = (event: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(event.target as Node)) onClose();
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handleClickOutside);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleClickOutside);
            document.body.style.overflow = '';
            previousFocus?.focus();
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px] transition-opacity">
            <div
                ref={modalRef}
                className={`modal-surface flex max-h-[calc(100vh-2rem)] w-full ${modalSizeClass[size]} flex-col overflow-hidden rounded-2xl transform transition-all`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
            >
                <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-700">
                    <h2 id={titleId} className="min-w-0 text-lg font-bold leading-7 text-slate-950 dark:text-white">{title}</h2>
                    <button aria-label={`Close ${title}`} onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-3 focus:ring-abz-primary dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">
                        <XIcon className="h-5 w-5" />
                    </button>
                </div>
                <div className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto ${contentClassName ?? 'p-6'}`}>{children}</div>
            </div>
        </div>
    );
};

export default Modal;
