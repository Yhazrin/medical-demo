import { useTranslation } from 'react-i18next';

export interface ModelOption {
  value: string;
  label?: string;
  description?: string;
  labelKey?: string;
  descriptionKey?: string;
}

interface ModelSelectorProps {
  options: ModelOption[];
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
  const { t } = useTranslation();
  const selected = options.find((o) => o.value === value);

  const getLabel = (option: ModelOption) => {
    return option.labelKey ? t(option.labelKey) : option.label;
  };

  const getDescription = (option: ModelOption) => {
    return option.descriptionKey ? t(option.descriptionKey) : option.description;
  };

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
            {getLabel(option)}
          </button>
        ))}
      </div>
      {selected && getDescription(selected) && (
        <p
          style={{
            marginTop: '0.75rem',
            fontSize: '0.8125rem',
            lineHeight: 1.5,
            color: 'var(--text-secondary)',
            marginBottom: 0,
          }}
        >
          {getDescription(selected)}
        </p>
      )}
    </div>
  );
}
