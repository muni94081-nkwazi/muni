import { Outlet } from 'react-router-dom';
import SellerSidebar from './SellerSidebar';
import SellerHeader from './SellerHeader';

const SellerLayout = () => {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--color-surface-muted)' }}>
      <SellerSidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <SellerHeader />
        <main style={{ padding: 'var(--spacing-6)', flex: 1, overflow: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default SellerLayout;
