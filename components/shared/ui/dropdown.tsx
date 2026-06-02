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
      className={`absolute mt-2 w-72 rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/18 ring-1 ring-slate-900/5 focus:outline-none z-[100] dark:border-slate-700 dark:bg-slate-950 ${alignmentClasses} ${className}`}
    >
      <div className="py-2">{children}</div>
    </div>
  );
};

export const DropdownItem: React.FC<{ children: React.ReactNode; onSelect?: () => void; className?: string; closeOnSelect?: boolean }> = ({ children, onSelect, className='', closeOnSelect = true }) => {
  const { setIsOpen } = useDropdown();
  const handleSelect = () => {
    onSelect?.();
    if (closeOnSelect) setIsOpen(false);
  };
  return (
    <button
      onClick={handleSelect}
      className={`w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-[#ffbc03]/12 dark:text-slate-200 dark:hover:bg-slate-900 ${className}`}
    >
      {children}
    </button>
  );
};

export const DropdownSeparator: React.FC = () => <div className="my-2 h-px bg-slate-200 dark:bg-gray-800" />;

export const DropdownGroupLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="px-4 pb-1 pt-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.16em]">{children}</div>
);
