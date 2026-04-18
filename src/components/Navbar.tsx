import { Activity } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ThemeToggle from './ThemeToggle';
import LanguageToggle from './LanguageToggle';
import { useWorkflowRouteContext } from '../config/workflowRouteContext';

const navItems = [
  { to: '/', labelKey: 'nav.preprocessing' },
  { to: '/classify', labelKey: 'nav.classification' },
  { to: '/segment', labelKey: 'nav.segmentation' },
];

export default function Navbar() {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const ctx = useWorkflowRouteContext(pathname);

  return (
    <header
      className="glass-card nav-bar"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        margin: '0 1rem',
        marginTop: '1rem',
        padding: '0.65rem 1.25rem',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <div className="nav-bar-brand" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '2.5rem',
            height: '2.5rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--accent-muted)',
            border: '1px solid var(--stroke-1)',
            color: 'var(--accent-strong)',
          }}
        >
          <Activity size={22} strokeWidth={2.25} />
        </div>
        <div style={{ lineHeight: 1.2 }}>
          <span
            style={{
              display: 'block',
              fontFamily: 'var(--font-display)',
              fontSize: '0.9375rem',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
            }}
          >
            {t('nav.systemTitle')}
          </span>
        </div>
      </div>

      <div className="nav-bar-context">
        <div
          className="nav-context-capsule"
          role="status"
          aria-live="polite"
          title={`${ctx.kicker} ${ctx.title} — ${ctx.description}`}
        >
          <div key={pathname} className="nav-context-capsule-inner">
            <p className="nav-context-line">
              <span className="nav-context-kicker-inline">{ctx.kicker}</span>
              <span className="nav-context-sep" aria-hidden="true">
                ·
              </span>
              <span className="nav-context-title-strong">{ctx.title}</span>
              <span className="nav-context-sep" aria-hidden="true">
                —
              </span>
              <span>{ctx.description}</span>
            </p>
          </div>
        </div>
      </div>

      <div
        className="nav-bar-actions"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
        }}
      >
        <nav style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </header>
  );
}
