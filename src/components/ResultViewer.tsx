import { Image } from 'lucide-react';

interface ResultImage {
  src: string;
  label: string;
}

interface ResultViewerProps {
  images: ResultImage[];
  title?: string;
  emptyText?: string;
}

export default function ResultViewer({
  images,
  title,
  emptyText = '暂无结果',
}: ResultViewerProps) {
  return (
    <div>
      {title && <h3 className="section-title">{title}</h3>}

      {images.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2.75rem 1rem',
            color: 'var(--text-muted)',
            borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--stroke-1)',
            background: 'var(--bg-inset)',
          }}
        >
          <Image size={36} strokeWidth={1.5} style={{ marginBottom: '0.75rem', opacity: 0.45 }} />
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {emptyText}
          </p>
        </div>
      ) : (
        <div className="result-grid">
          {images.map((img, i) => (
            <div
              key={i}
              className="result-thumb"
              style={{
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                border: '1px solid var(--stroke-1)',
                background: 'var(--bg-inset)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
              }}
            >
              <div style={{ overflow: 'hidden' }}>
                <img
                  src={img.src}
                  alt={img.label}
                  style={{
                    width: '100%',
                    height: '12rem',
                    objectFit: 'cover',
                    display: 'block',
                    transition: 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'scale(1.04)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                />
              </div>
              <p
                style={{
                  padding: '0.625rem 0.75rem',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  margin: 0,
                  borderTop: '1px solid var(--stroke-2)',
                }}
              >
                {img.label}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
