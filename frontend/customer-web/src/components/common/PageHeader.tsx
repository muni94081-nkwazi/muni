import React from 'react';
import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: string;
  breadcrumbs: BreadcrumbItem[];
}

export function PageHeader({ title, subtitle, icon, breadcrumbs }: PageHeaderProps) {
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #131921 0%, #232f3e 100%)',
        color: '#ffffff',
        padding: '32px 24px',
        borderRadius: '12px',
        marginBottom: '24px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      }}
    >
      <div style={{ display: 'flex', gap: '8px', fontSize: '13px', color: '#94a3b8', marginBottom: '12px', alignItems: 'center' }}>
        <Link to="/" style={{ color: '#febd69', textDecoration: 'none', fontWeight: 600 }}>
          Home
        </Link>
        {breadcrumbs.map((b, idx) => (
          <React.Fragment key={idx}>
            <span style={{ opacity: 0.6 }}>/</span>
            {b.href ? (
              <Link to={b.href} style={{ color: '#febd69', textDecoration: 'none' }}>
                {b.label}
              </Link>
            ) : (
              <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{b.label}</span>
            )}
          </React.Fragment>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {icon && <span style={{ fontSize: '2.25rem', lineHeight: 1 }}>{icon}</span>}
        <div>
          <h1 style={{ margin: 0, fontSize: '1.875rem', fontWeight: 800, color: '#ffffff' }}>{title}</h1>
          {subtitle && <p style={{ margin: '6px 0 0 0', fontSize: '0.95rem', color: '#cbd5e1', lineHeight: 1.5 }}>{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
