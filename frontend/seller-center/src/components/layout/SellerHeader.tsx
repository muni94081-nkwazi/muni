import { ThemeToggle } from '../common/ThemeToggle/ThemeToggle';

const SellerHeader = () => {
  return (
    <header style={{ 
      height: '64px', 
      backgroundColor: 'var(--color-surface)', 
      borderBottom: '1px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 var(--spacing-6)'
    }}>
      <h1 style={{ fontSize: '1.25rem', margin: 0 }}>Dashboard</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-4)' }}>
        <ThemeToggle />
        <span>🔔</span>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--color-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          S
        </div>
      </div>
    </header>
  );
};

export default SellerHeader;
