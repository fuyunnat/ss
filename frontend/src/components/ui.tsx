import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="field"><span>{label}</span>{children}</div>;
}

export function StatusBadge({ value, good = false }: { value: string; good?: boolean }) {
  const tone = good || value === 'online' || value === 'healthy' || value === 'succeeded' ? 'good' : value === 'failed' || value === 'offline' ? 'bad' : 'neutral';
  return <em className={`status-badge ${tone}`}>{statusLabel(value)}</em>;
}

export function statusLabel(value: string) {
  const map: Record<string, string> = {
    active: '启用',
    planned: '待部署',
    online: '在线',
    offline: '离线',
    healthy: '健康',
    unhealthy: '异常',
    unknown: '未知',
    succeeded: '成功',
    failed: '失败',
    running: '执行中',
    queued: '排队中',
  };
  return map[value] ?? value;
}

type SelectOption = string | { value: string; label: string };

type CustomSelectProps = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
};

export function CustomSelect({ value, options, onChange, ariaLabel, disabled = false }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const items = useMemo(() => options.map((option) => typeof option === 'string' ? { value: option, label: option } : option), [options]);
  const selected = items.find((item) => item.value === value) ?? items[0];

  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return (
    <div className="custom-select" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        className="custom-select-trigger"
        disabled={disabled}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label ?? value}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="custom-select-menu" id={listId} role="listbox">
          {items.map((item) => (
            <button
              aria-selected={item.value === value}
              className={item.value === value ? 'custom-select-option active' : 'custom-select-option'}
              key={item.value}
              role="option"
              type="button"
              onClick={() => {
                onChange(item.value);
                setOpen(false);
              }}
            >
              <span>{item.label}</span>
              {item.value === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
