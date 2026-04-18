import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Status = 'idle' | 'processing' | 'done' | 'error';

interface StatusBadgeProps {
  status: Status;
  text?: string;
}

const statusKeys: Record<Status, string> = {
  idle: 'common.idle',
  processing: 'common.processing',
  done: 'common.done',
  error: 'common.error',
};

export default function StatusBadge({ status, text }: StatusBadgeProps) {
  const { t } = useTranslation();

  const getConfig = (s: Status) => {
    switch (s) {
      case 'idle':
        return {
          bg: 'var(--bg-inset)',
          color: 'var(--text-muted)',
          border: 'var(--stroke-1)',
          icon: undefined,
        };
      case 'processing':
        return {
          bg: 'var(--bg-inset)',
          color: 'var(--text-primary)',
          border: 'var(--stroke-1)',
          icon: <Loader2 size={14} className="animate-spin" />,
        };
      case 'done':
        return {
          bg: 'var(--inverse-bg)',
          color: 'var(--inverse-fg)',
          border: 'var(--inverse-bg)',
          icon: <CheckCircle size={14} />,
        };
      case 'error':
        return {
          bg: 'transparent',
          color: 'var(--text-primary)',
          border: 'var(--chip-outline)',
          icon: <AlertCircle size={14} />,
        };
    }
  };

  const cfg = getConfig(status);

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
      {text ?? t(statusKeys[status])}
    </span>
  );
}
