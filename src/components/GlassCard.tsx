import type { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  /** 占满结果区高度，内容区可滚动（适合大图/长列表） */
  fill?: boolean;
}

export default function GlassCard({ children, className = '', title, fill }: GlassCardProps) {
  return (
    <div className={`glass-card ${fill ? 'glass-card--fill' : ''} ${className}`.trim()}>
      {title ? <h3 className="section-title">{title}</h3> : null}
      {fill ? <div className="glass-card__body">{children}</div> : children}
    </div>
  );
}
