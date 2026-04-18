import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface WorkspaceLayoutProps {
  hero?: ReactNode;
  sidebar: ReactNode;
  main: ReactNode;
  sidebarLabel?: string;
  mainLabel?: string;
  footer?: ReactNode;
}

export default function WorkspaceLayout({
  hero,
  sidebar,
  main,
  sidebarLabel,
  mainLabel,
  footer,
}: WorkspaceLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="workspace">
      {hero ?? null}
      <div className="workspace-grid">
        <aside className="workspace-sidebar" aria-label={sidebarLabel ? t(sidebarLabel) : undefined}>
          <div className="workspace-sidebar-top">
            <div className="workspace-panel-heading">
              <span className="workspace-panel-label">{sidebarLabel ? t(sidebarLabel) : ''}</span>
            </div>
          </div>
          <div className="workspace-sidebar-scroll">
            <div className="workspace-stack">{sidebar}</div>
          </div>
        </aside>
        <section className="workspace-main" aria-label={mainLabel ? t(mainLabel) : undefined}>
          <div className="workspace-panel-heading">
            <span className="workspace-panel-label">{mainLabel ? t(mainLabel) : ''}</span>
          </div>
          <div className="workspace-main-frame">
            <div className="workspace-stack workspace-stack--grow">{main}</div>
          </div>
        </section>
      </div>
      {footer ? <div className="workspace-footer">{footer}</div> : null}
    </div>
  );
}
