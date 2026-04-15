import { useRef, useState, type DragEvent } from 'react';
import { Upload } from 'lucide-react';

interface UploadZoneProps {
  onFilesSelected: (files: FileList) => void;
  accept?: string;
  multiple?: boolean;
  title?: string;
  subtitle?: string;
}

export default function UploadZone({
  onFilesSelected,
  accept,
  multiple = false,
  title = '上传文件',
  subtitle = '点击或拖拽文件到此处',
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      onFilesSelected(e.dataTransfer.files);
    }
  };

  const handleChange = () => {
    if (inputRef.current?.files && inputRef.current.files.length > 0) {
      onFilesSelected(inputRef.current.files);
    }
  };

  return (
    <div
      className={`upload-zone${isDragging ? ' dragging' : ''}`}
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ cursor: 'pointer' }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      <Upload
        size={36}
        strokeWidth={1.75}
        style={{
          color: 'var(--accent-strong)',
          marginBottom: '0.75rem',
          opacity: 0.9,
        }}
      />
      <p
        style={{
          fontSize: '1rem',
          fontWeight: 600,
          marginBottom: '0.35rem',
          color: 'var(--text-primary)',
        }}
      >
        {title}
      </p>
      <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: 0 }}>
        {subtitle}
      </p>
    </div>
  );
}
