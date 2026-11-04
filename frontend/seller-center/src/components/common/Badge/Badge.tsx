import React from 'react';

type NamedBadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

// Named variants get an intentional color; any other string (e.g. domain status values
// like 'active', 'healthy', 'gold', 'customs_hold') falls back to keyword-based resolution
// below, so downstream domain code never needs to edit this file.
export type BadgeVariant = NamedBadgeVariant | (string & {});

interface BadgeProps {
  variant: BadgeVariant;
  label: string;
}

const NAMED_COLORS: Record<NamedBadgeVariant, { bg: string; text: string }> = {
  success: { bg: '#e6f4ea', text: '#137333' },
  warning: { bg: '#fef7e0', text: '#b06000' },
  danger: { bg: '#fce8e6', text: '#c5221f' },
  info: { bg: '#e8f0fe', text: '#1967d2' },
  neutral: { bg: '#f1f3f4', text: '#3c4043' },
};

const KEYWORD_RULES: [RegExp, { bg: string; text: string }][] = [
  [/^(reject|deny|denied|danger|error|fail|down|critical|customs_hold|held|violation)/i, NAMED_COLORS.danger],
  [/^(approve|active|resolved|healthy|clear|good|paid|delivered|success)/i, NAMED_COLORS.success],
  [/^(pending|review|hold|degraded|draft|at_risk|submitted)/i, NAMED_COLORS.warning],
  [/^(suspend|paused|ended|archived)/i, NAMED_COLORS.neutral],
  [/^(open|transit|booked)/i, NAMED_COLORS.info],
];

const resolveColors = (variant: BadgeVariant): { bg: string; text: string } => {
  if (variant in NAMED_COLORS) return NAMED_COLORS[variant as NamedBadgeVariant];
  const match = KEYWORD_RULES.find(([re]) => re.test(variant));
  return match ? match[1] : NAMED_COLORS.neutral;
};

export const Badge: React.FC<BadgeProps> = ({ variant, label }) => {
  const style = resolveColors(variant);

  return (
    <span style={{
      display: 'inline-block',
      padding: '4px 8px',
      borderRadius: '12px',
      fontSize: '0.75rem',
      fontWeight: 600,
      backgroundColor: style.bg,
      color: style.text,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
};
