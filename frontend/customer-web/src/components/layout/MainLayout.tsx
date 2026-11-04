import { Outlet } from 'react-router-dom';
import { Navbar } from '@/components/common/Navbar/Navbar';
import { Footer } from '@/components/common/Footer/Footer';
import { ToastContainer } from '@/components/common/ToastContainer';
import { CartDrawer } from '@/components/cart/CartDrawer';

export function MainLayout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar />
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <Footer />
      <ToastContainer />
      <CartDrawer />
    </div>
  );
}
