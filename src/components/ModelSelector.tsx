interface Option {
  value: string;
  label: string;
  description?: string;
}

interface ModelSelectorProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  title?: string;
}

export default function ModelSelector({
  options,
  value,
  onChange,
  title,
}: ModelSelectorProps) {
  const selected = options.find((o) => o.value === value);

  return (
    <div>
      {title && (
        <h4
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.625rem',
            fontWeight: 500,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            margin: '0 0 0.65rem',
          }}
        >
          {title}
        </h4>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {options.map((option) => (
          <button
            key={option.value}
            className={`radio-pill${value === option.value ? ' active' : ''}`}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      {selected?.description && (
        <p
          style={{
            marginTop: '0.75rem',
            fontSize: '0.8125rem',
            lineHeight: 1.5,
            color: 'var(--text-secondary)',
            marginBottom: 0,
          }}
        >
          {selected.description}
        </p>
      )}
    </div>
  );
}
