import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../router/routes';
import { Button } from '../components/common/Button/Button';
import { useAppDispatch } from '../store/hooks/useAppSelector';
import { logoutThunk } from '../store/slices/authSlice';

const UnauthorizedPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const handleSignOut = async () => {
    await dispatch(logoutThunk());
    navigate(ROUTES.LOGIN);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-sidebar-bg)' }}>
      <div style={{ width: '100%', maxWidth: '420px', textAlign: 'center', backgroundColor: 'var(--color-surface)', padding: 'var(--spacing-8)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 'var(--spacing-3)' }}>🚫</div>
        <h2 style={{ marginBottom: 'var(--spacing-2)', color: 'var(--color-text-primary)' }}>Seller access required</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--spacing-6)' }}>
          This account is signed in, but isn't registered as a seller. The Seller Center
          is only available to accounts with an approved seller application.
        </p>
        {/* Previously this page offered only "Sign out", which made it a dead
            end: the copy told the visitor they needed an approved application
            and then gave them no way to make one. */}
        <Button fullWidth onClick={() => navigate(ROUTES.APPLY)}>Apply to become a seller</Button>
        <div style={{ marginTop: 'var(--spacing-3)' }}>
          <Button fullWidth variant="ghost" onClick={handleSignOut}>Sign out</Button>
        </div>
      </div>
    </div>
  );
};

export default UnauthorizedPage;
