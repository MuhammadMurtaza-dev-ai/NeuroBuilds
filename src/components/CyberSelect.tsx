import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export default function CyberSelect({ value, onChange, options, disabled, className = '', placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find(o => o.value === value);
  const displayLabel = selected?.label ?? placeholder ?? 'Select…';

  const openDropdown = () => {
    if (!triggerRef.current || disabled) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const estimatedHeight = Math.min(options.length * 36 + 8, 256);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < estimatedHeight && rect.top > estimatedHeight;

    setDropdownStyle(
      openUpward
        ? { position: 'fixed', bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width, zIndex: 9999 }
        : { position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 9999 }
    );
    setOpen(true);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !listRef.current?.contains(t)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // Close on any scroll (position becomes stale)
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [open]);

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className={[
          'w-full flex items-center justify-between gap-2',
          'px-3 py-[0.625rem] rounded-xl text-sm cursor-pointer',
          'bg-[var(--bg-panel)] border border-[var(--border-glass-strong)]',
          'text-[var(--text-base)] transition-colors duration-150',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          open
            ? 'border-primary/55 shadow-[0_0_0_3px_rgba(13,242,242,0.1),0_0_8px_rgba(13,242,242,0.15)]'
            : 'hover:border-primary/30',
        ].join(' ')}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate text-left">{displayLabel}</span>
        <svg
          className={`shrink-0 w-4 h-4 text-primary transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && createPortal(
        <ul
          ref={listRef}
          role="listbox"
          style={dropdownStyle}
          className="max-h-64 overflow-y-auto glass-panel rounded-xl border border-white/10 shadow-neon py-1 no-scrollbar"
        >
          {options.map(opt => {
            const isSel = opt.value === value;
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSel}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={[
                  'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer select-none transition-colors',
                  isSel
                    ? 'text-primary bg-primary/10'
                    : 'text-[var(--text-base)] hover:bg-white/5',
                ].join(' ')}
              >
                {isSel ? (
                  <>
                    <svg className="w-3.5 h-3.5 text-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {opt.label}
                  </>
                ) : (
                  <span className="pl-[1.375rem]">{opt.label}</span>
                )}
              </li>
            );
          })}
        </ul>,
        document.body
      )}
    </div>
  );
}
