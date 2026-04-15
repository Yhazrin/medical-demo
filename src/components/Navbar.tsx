import { Activity } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import { getWorkflowRouteContext } from '../config/workflowRouteContext';

const navItems = [
  { to: '/', label: 'MRI 预处理' },
  { to: '/classify', label: '切片分类' },
  { to: '/segment', label: '病灶分割' },
];

export default function Navbar() {
  const { pathname } = useLocation();
  const ctx = getWorkflowRouteContext(pathname);

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
            医学影像工作台
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.625rem',
              fontWeight: 500,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            MRI · 分类 · 分割
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
              {item.label}
            </NavLink>
          ))}
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}
