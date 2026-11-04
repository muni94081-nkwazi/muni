import { Link, useLocation } from 'react-router-dom';
import { ROUTES } from '../../router/routes';

const navItems = [
  { label: 'Dashboard', path: ROUTES.DASHBOARD, icon: '📊' },
  { label: 'Products', path: ROUTES.PRODUCTS, icon: '📦' },
  { label: 'Inventory', path: ROUTES.INVENTORY, icon: '🏭' },
  { label: 'Orders', path: ROUTES.ORDERS, icon: '🛒' },
  { label: 'Disputes & Returns', path: '/disputes-returns', icon: '⚖️' },
  { label: 'Buyer Messages', path: '/messages', icon: '💬' },
  { label: 'Store Customizer', path: '/store-settings', icon: '🏪' },
  { label: 'Homepage Deals Nomination', path: '/container-submissions', icon: '🌟' },
  { label: 'Payouts', path: ROUTES.PAYOUTS, icon: '💰' },
  { label: 'Analytics', path: ROUTES.ANALYTICS, icon: '📈' },
  { label: 'Settings', path: ROUTES.SETTINGS, icon: '⚙️' }
];

const SellerSidebar = () => {
  const location = useLocation();

  return (
    <aside style={{ width: '240px', backgroundColor: 'var(--color-sidebar-bg)', color: 'var(--color-sidebar-text)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 'var(--spacing-6)', fontSize: '1.25rem', fontWeight: 'bold' }}>
        MUNI Seller
      </div>
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)', padding: '0 var(--spacing-4)' }}>
        {navItems.map(item => {
          const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)',
                padding: 'var(--spacing-3)', borderRadius: 'var(--radius-md)',
                backgroundColor: isActive ? 'var(--color-sidebar-active)' : 'transparent',
                color: isActive ? '#fff' : 'var(--color-sidebar-text)'
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div style={{ padding: 'var(--spacing-4)' }}>
        <button style={{ width: '100%', padding: 'var(--spacing-2)', backgroundColor: 'var(--color-danger)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)' }}>
          Logout
        </button>
      </div>
    </aside>
  );
};

export default SellerSidebar;
