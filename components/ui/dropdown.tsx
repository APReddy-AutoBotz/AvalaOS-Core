import React, { useState, useRef, useEffect, createContext, useContext } from 'react';

interface DropdownContextType {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const DropdownContext = createContext<DropdownContextType | undefined>(undefined);

const useDropdown = () => {
  const context = useContext(DropdownContext);
  if (!context) {
    throw new Error('useDropdown must be used within a Dropdown provider');
  }
  return context;
};

export const Dropdown: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <DropdownContext.Provider value={{ isOpen, setIsOpen }}>
      <div className="relative inline-block text-left" ref={dropdownRef}>
        {children}
      </div>
    </DropdownContext.Provider>
  );
};

export const DropdownTrigger: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setIsOpen } = useDropdown();
  return <div onClick={() => setIsOpen(prev => !prev)}>{children}</div>;
};

export const DropdownContent: React.FC<{
  children: React.ReactNode;
  className?: string;
  align?: 'start' | 'end';
}> = ({ children, className = '', align = 'start' }) => {
  const { isOpen } = useDropdown();
  if (!isOpen) return null;

  const alignmentClasses = align === 'end'
    ? 'right-0 origin-top-right'
    : 'left-0 origin-top-left';

  return (
    <div
      className={`absolute mt-2 w-72 rounded-2xl bg-white dark:bg-surface-dark shadow-soft ring-1 ring-black ring-opacity-5 focus:outline-none z-20 border border-slate-200 dark:border-gray-700 ${alignmentClasses} ${className}`}
    >
      <div className="py-1">{children}</div>
    </div>
  );
};

export const DropdownItem: React.FC<{ children: React.ReactNode; onSelect?: () => void; className?: string }> = ({ children, onSelect, className='' }) => {
  const { setIsOpen } = useDropdown();
  const handleSelect = () => {
    onSelect?.();
    setIsOpen(false);
  };
  return (
    <button
      onClick={handleSelect}
      className={`w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-abz-ink ${className}`}
    >
      {children}
    </button>
  );
};

export const DropdownSeparator: React.FC = () => <div className="my-1 h-px bg-slate-200 dark:bg-gray-700" />;

export const DropdownGroupLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">{children}</div>
);