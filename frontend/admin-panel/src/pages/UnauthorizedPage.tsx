import { useNavigate } from 'react-router-dom';
import { logoutThunk } from '../store/slices/authSlice';
import { useAppDispatch } from '../store/hooks/useAppSelector';

export function UnauthorizedPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const handleSignOut = async () => {
    await dispatch(logoutThunk());
    navigate('/login');
  };

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
      <div className="card" style={{ width: 420, padding: 'var(--space-6)', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-4)' }}>🚫</div>
        <h2 style={{ marginBottom: 'var(--space-3)' }}>Admin access required</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-5)' }}>
          This account is signed in, but doesn't hold an admin role. The Admin Panel
          requires ROLE_ADMIN or ROLE_SUPER_ADMIN.
        </p>
        <button
          onClick={handleSignOut}
          style={{ width: '100%', padding: '12px', background: 'var(--color-accent)', color: '#fff', borderRadius: 'var(--radius-sm)', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
