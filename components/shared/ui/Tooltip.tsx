import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, position = 'top' }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const childrenRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);

  const updatePosition = () => {
    if (!childrenRef.current) return;
    const rect = childrenRef.current.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    let top = 0;
    let left = 0;

    // We do rough positioning here. A robust tooltip typically measures its own rendered size.
    // For simplicity, we center based on the anchor rect.
    switch (position) {
      case 'bottom':
        top = rect.bottom + scrollY + 8;
        left = rect.left + rect.width / 2 + scrollX;
        break;
      case 'left':
        top = rect.top + rect.height / 2 + scrollY;
        left = rect.left + scrollX - 8;
        break;
      case 'right':
        top = rect.top + rect.height / 2 + scrollY;
        left = rect.right + scrollX + 8;
        break;
      case 'top':
      default:
        top = rect.top + scrollY - 8;
        left = rect.left + rect.width / 2 + scrollX;
        break;
    }

    setCoords({ top, left });
  };

  const handleMouseEnter = () => {
    timeoutRef.current = window.setTimeout(() => {
      updatePosition();
      setIsVisible(true);
    }, 300);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  useEffect(() => {
    if (isVisible) {
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isVisible]);

  const getTransformClass = () => {
     switch (position) {
       case 'bottom': return '-translate-x-1/2';
       case 'left': return '-translate-y-1/2 -translate-x-full';
       case 'right': return '-translate-y-1/2';
       case 'top': 
       default: return '-translate-x-1/2 -translate-y-full';
     }
  };

  return (
    <>
      <div
        ref={childrenRef}
        className="inline-block w-full"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>
      {isVisible && createPortal(
        <div
          style={{ top: coords.top, left: coords.left }}
          className={`fixed z-[9999] px-3 py-1.5 text-sm font-medium text-white bg-slate-900 shadow-xl whitespace-nowrap rounded-lg pointer-events-none ${getTransformClass()}`}
        >
          {content}
        </div>,
        document.body
      )}
    </>
  );
};
