import React, { ReactNode } from 'react';

export interface TabItem {
  key: string;
  label: string;
  badge?: ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeKey, onChange }) => {
  return (
    <div style={{ display: 'flex', gap: 'var(--spacing-2)', borderBottom: '1px solid var(--color-border)' }}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{
              padding: 'var(--spacing-3) var(--spacing-4)',
              background: 'none',
              border: 'none',
              borderBottom: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
              color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              fontWeight: isActive ? 600 : 500,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-2)',
            }}
          >
            {tab.label}
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
};
