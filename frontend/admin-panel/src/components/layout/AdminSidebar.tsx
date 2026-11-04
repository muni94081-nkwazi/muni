import { Link, useLocation } from 'react-router-dom';
import { ROUTES } from '../../router/routes';

export function AdminSidebar() {
  const location = useLocation();

  const links = [
    { name: 'Overview', path: ROUTES.DASHBOARD, icon: '📊' },
    { name: 'Users', path: ROUTES.USERS, icon: '👥' },
    { name: 'Products', path: ROUTES.PRODUCTS, icon: '🛍️' },
    { name: 'Orders', path: ROUTES.ORDERS, icon: '📦' },
    { name: 'Disputes', path: ROUTES.DISPUTES, icon: '⚖️' },
    { name: 'Seller Verification', path: ROUTES.SELLER_VERIFICATION, icon: '📜' },
    { name: 'Guarantee Claims', path: ROUTES.BUYER_PROTECTION_ADMIN, icon: '🛡️' },
    { name: 'Financials & Take-Rate', path: ROUTES.FINANCIALS, icon: '💰' },
    { name: 'Homepage Containers', path: ROUTES.CONTAINERS, icon: '🖼️' },
    { name: 'Categories', path: ROUTES.CATEGORIES, icon: '🗂️' },
    { name: 'Analytics', path: ROUTES.ANALYTICS, icon: '📈' },
    { name: 'Newsletter', path: ROUTES.NEWSLETTER, icon: '✉️' },
    { name: 'Settings', path: ROUTES.SETTINGS, icon: '⚙️' },
  ];

  return (
    <aside className="admin-sidebar" style={{
      width: '240px', background: 'var(--color-sidebar-bg)', color: '#fff',
      display: 'flex', flexDirection: 'column'
    }}>
      <div style={{ padding: 'var(--space-5)', fontSize: '1.5rem', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        MUNI Admin
      </div>
      <nav style={{ flex: 1, padding: 'var(--space-3) 0' }}>
        {links.map((link) => {
          const isActive = location.pathname === link.path || (link.path !== '/' && location.pathname.startsWith(link.path));
          return (
            <Link
              key={link.name}
              to={link.path}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                padding: 'var(--space-3) var(--space-5)',
                color: isActive ? 'var(--color-sidebar-text)' : 'var(--color-sidebar-text-muted)',
                background: isActive ? 'var(--color-sidebar-nav-active)' : 'transparent',
                textDecoration: 'none',
                transition: 'all 0.2s'
              }}
            >
              <span>{link.icon}</span>
              <span>{link.name}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
