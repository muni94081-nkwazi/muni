import { Routes, Route, Navigate } from 'react-router-dom';
import { ROUTES } from './routes';
import { PrivateRoute } from './PrivateRoute';
import { AdminLayout } from '../components/layout/AdminLayout';

import { LoginPage } from '../pages/LoginPage';
import { UnauthorizedPage } from '../pages/UnauthorizedPage';
import { DashboardPage } from '../pages/DashboardPage';
import { UsersPage } from '../pages/UsersPage';
import { UserDetailsPage } from '../pages/UserDetailsPage';
import { ProductsPage } from '../pages/ProductsPage';
import { ProductCreatePage } from '../pages/ProductCreatePage';
import { ProductModerationPage } from '../pages/ProductModerationPage';
import { OrdersPage } from '../pages/OrdersPage';
import { DisputesPage } from '../pages/DisputesPage';
import { CategoriesPage } from '../pages/CategoriesPage';
import { AnalyticsPage } from '../pages/AnalyticsPage';
import { NewsletterPage } from '../pages/NewsletterPage';
import { SettingsPage } from '../pages/SettingsPage';
import { SellerVerificationPage } from '../pages/SellerVerificationPage';
import BuyerProtectionAdminPage from '../pages/BuyerProtectionAdminPage';
import FinancialsPage from '../pages/FinancialsPage';
import ContainersAdminPage from '../pages/ContainersAdminPage';

export function Router() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route element={<PrivateRoute />}>
        <Route element={<AdminLayout />}>
          <Route path={ROUTES.DASHBOARD} element={<DashboardPage />} />
          <Route path={ROUTES.USERS} element={<UsersPage />} />
          <Route path={ROUTES.USER_DETAILS} element={<UserDetailsPage />} />
          <Route path={ROUTES.PRODUCTS} element={<ProductsPage />} />
          <Route path={ROUTES.PRODUCT_CREATE} element={<ProductCreatePage />} />
          <Route path={ROUTES.PRODUCT_MODERATION} element={<ProductModerationPage />} />
          <Route path={ROUTES.ORDERS} element={<OrdersPage />} />
          <Route path={ROUTES.DISPUTES} element={<DisputesPage />} />
          <Route path={ROUTES.SELLER_VERIFICATION} element={<SellerVerificationPage />} />
          <Route path={ROUTES.BUYER_PROTECTION_ADMIN} element={<BuyerProtectionAdminPage />} />
          <Route path={ROUTES.FINANCIALS} element={<FinancialsPage />} />
          <Route path={ROUTES.CONTAINERS} element={<ContainersAdminPage />} />
          <Route path={ROUTES.CATEGORIES} element={<CategoriesPage />} />
          <Route path={ROUTES.ANALYTICS} element={<AnalyticsPage />} />
          <Route path={ROUTES.NEWSLETTER} element={<NewsletterPage />} />
          <Route path={ROUTES.SETTINGS} element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
