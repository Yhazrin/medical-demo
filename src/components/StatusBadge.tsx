import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';

type Status = 'idle' | 'processing' | 'done' | 'error';

interface StatusBadgeProps {
  status: Status;
  text?: string;
}

const statusConfig: Record<
  Status,
  { bg: string; color: string; border: string; label: string; icon?: ReactNode }
> = {
  idle: {
    bg: 'var(--bg-inset)',
    color: 'var(--text-muted)',
    border: 'var(--stroke-1)',
    label: '就绪',
  },
  processing: {
    bg: 'var(--bg-inset)',
    color: 'var(--text-primary)',
    border: 'var(--stroke-1)',
    label: '处理中',
    icon: <Loader2 size={14} className="animate-spin" />,
  },
  done: {
    bg: 'var(--inverse-bg)',
    color: 'var(--inverse-fg)',
    border: 'var(--inverse-bg)',
    label: '完成',
    icon: <CheckCircle size={14} />,
  },
  error: {
    bg: 'transparent',
    color: 'var(--text-primary)',
    border: 'var(--chip-outline)',
    label: '错误',
    icon: <AlertCircle size={14} />,
  },
};

export default function StatusBadge({ status, text }: StatusBadgeProps) {
  const cfg = statusConfig[status];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.25rem 0.75rem',
        borderRadius: 'var(--radius-md)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.6875rem',
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        backgroundColor: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
      }}
    >
      {cfg.icon}
      {text ?? cfg.label}
    </span>
  );
}
