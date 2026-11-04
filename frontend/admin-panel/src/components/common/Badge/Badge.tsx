import React from 'react';

// Named variants get an intentional color; any other string falls back to keyword-based
// resolution in getStyles() below, so downstream domain code never needs to edit this file.
type NamedBadgeVariant =
  | 'pending' | 'approved' | 'flagged' | 'danger' | 'active' | 'suspended' | 'open' | 'resolved' | 'info'
  | 'bronze' | 'silver' | 'gold' | 'platinum'
  | 'healthy' | 'degraded' | 'down';

export type BadgeVariant = NamedBadgeVariant | (string & {});

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
}

const KEYWORD_RULES: [RegExp, React.CSSProperties][] = [
  [/^(reject|deny|denied|danger|error|fail|down|critical|customs_hold|held)/i, { backgroundColor: '#f8d7da', color: '#721c24' }],
  [/^(approve|active|resolved|healthy|clear|good|paid|delivered|success)/i, { backgroundColor: '#d4edda', color: '#155724' }],
  [/^(pending|warning|review|hold|degraded|draft|at_risk)/i, { backgroundColor: '#fff3cd', color: '#856404' }],
  [/^(suspend|paused|ended|neutral)/i, { backgroundColor: '#e2e3e5', color: '#383d41' }],
  [/^(open|info|transit|booked)/i, { backgroundColor: '#cce5ff', color: '#004085' }],
];

const getStyles = (variant: BadgeVariant): React.CSSProperties => {
  switch (variant) {
    case 'pending': return { backgroundColor: '#fff3cd', color: '#856404' };
    case 'approved': case 'active': case 'resolved': return { backgroundColor: '#d4edda', color: '#155724' };
    case 'flagged': case 'danger': return { backgroundColor: '#f8d7da', color: '#721c24' };
    case 'suspended': return { backgroundColor: '#e2e3e5', color: '#383d41' };
    case 'open': case 'info': return { backgroundColor: '#cce5ff', color: '#004085' };
    case 'bronze': return { backgroundColor: '#f1e0d6', color: '#8a5a2b' };
    case 'silver': return { backgroundColor: '#e6e8eb', color: '#54606b' };
    case 'gold': return { backgroundColor: '#fdf0c8', color: '#93720a' };
    case 'platinum': return { backgroundColor: '#e3e8fd', color: '#3949ab' };
    case 'healthy': return { backgroundColor: '#d4edda', color: '#155724' };
    case 'degraded': return { backgroundColor: '#fff3cd', color: '#856404' };
    case 'down': return { backgroundColor: '#f8d7da', color: '#721c24' };
    default: {
      const match = KEYWORD_RULES.find(([re]) => re.test(variant));
      return match ? match[1] : { backgroundColor: '#e2e3e5', color: '#383d41' };
    }
  }
};

export const Badge: React.FC<BadgeProps> = ({ variant, children }) => {
  return (
    <span style={{
      ...getStyles(variant),
      padding: '2px 8px',
      borderRadius: 'var(--radius-full)',
      fontSize: '12px',
      fontWeight: 600,
      display: 'inline-block',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
};
