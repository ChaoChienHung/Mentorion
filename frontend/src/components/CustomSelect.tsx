import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function CustomSelect({
  value,
  options,
  onChange,
  disabled = false,
  compact = false,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value) ?? options[0];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 rounded-xl border text-left transition-colors ${
          compact ? "px-3 py-2 text-[13px]" : "px-4 py-3 text-[14px]"
        } ${
          disabled
            ? "bg-zinc-100 border-zinc-200 text-zinc-400 cursor-not-allowed"
            : open
              ? "bg-white border-zinc-900 text-zinc-950 cursor-pointer"
              : "bg-white border-zinc-200 hover:border-zinc-400 text-zinc-900 cursor-pointer"
        }`}
      >
        <span className="truncate font-medium">{selected?.label ?? value}</span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-zinc-500 transition-transform duration-150 ${
            open ? "rotate-180 text-zinc-900" : ""
          }`}
        />
      </button>

      {open && !disabled && (
        <div
          role="listbox"
          className="absolute z-40 mt-1.5 w-full min-w-[160px] rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg shadow-zinc-950/10"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-zinc-900 text-white font-medium"
                    : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check size={14} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
