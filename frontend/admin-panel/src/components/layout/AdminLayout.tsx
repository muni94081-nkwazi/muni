import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';
import { useAppDispatch, useAppSelector } from '../../store/hooks/useAppSelector';
import { fetchUserThunk } from '../../store/slices/authSlice';

export function AdminLayout() {
  const dispatch = useAppDispatch();
  const sidebarOpen = useAppSelector((state) => state.ui.sidebarOpen);
  const { user, isAuthenticated } = useAppSelector((state) => state.auth);

  // A page refresh restores isAuthenticated from the localStorage token
  // immediately, but not `user` (the login response isn't persisted) --
  // without this, the ROLE_ADMIN check in PrivateRoute silently skips
  // itself (it only runs when `user` is already loaded) until this resolves.
  useEffect(() => {
    if (isAuthenticated && !user) {
      dispatch(fetchUserThunk());
    }
  }, [dispatch, isAuthenticated, user]);

  return (
    <div className="admin-layout">
      {sidebarOpen && <AdminSidebar />}
      <div className="admin-main">
        <AdminHeader />
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
