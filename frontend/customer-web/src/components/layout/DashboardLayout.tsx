import { NavLink, Outlet } from 'react-router-dom';
import { Navbar } from '@/components/common/Navbar/Navbar';
import { ToastContainer } from '@/components/common/ToastContainer';
import { classNames } from '@/utils/helpers';

const navItems = [
  { to: '/dashboard', label: 'Overview' },
  { to: '/orders', label: 'Orders' },
  { to: '/profile', label: 'Profile' },
];

export function DashboardLayout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar />
      <div className="container" style={{ display: 'flex', gap: 'var(--space-6)', flex: 1, paddingBlock: 'var(--space-6)' }}>
        <aside style={{ width: 200, flexShrink: 0 }}>
          <nav aria-label="Dashboard">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  classNames(
                    'dashboard-nav-link',
                    isActive && 'dashboard-nav-link--active',
                  )
                }
                style={({ isActive }) => ({
                  display: 'block',
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                  fontSize: 'var(--text-sm)',
                  marginBottom: 'var(--space-1)',
                  background: isActive ? 'var(--color-market-green)' : 'transparent',
                  color: isActive ? 'var(--color-text-on-dark)' : 'var(--color-text-primary)',
                })}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main style={{ flex: 1, minWidth: 0 }}>
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}
