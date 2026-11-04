import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../store/hooks/useAppSelector';
import { logout } from '../../store/slices/authSlice';
import { toggleSidebar } from '../../store/slices/uiSlice';
import { ThemeToggle } from '../common/ThemeToggle/ThemeToggle';

export function AdminHeader() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useAppSelector((state) => state.auth);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  return (
    <header style={{
      height: '64px',
      background: '#fff',
      borderBottom: '1px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 var(--space-5)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <button onClick={() => dispatch(toggleSidebar())} style={{ fontSize: '1.2rem' }}>
          ☰
        </button>
        <div style={{ fontWeight: 600 }}>Dashboard</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <ThemeToggle />
        <span>🔔</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {user?.firstName?.[0] || 'A'}
          </div>
          <span style={{ fontSize: '0.9rem' }}>{user?.firstName} {user?.lastName}</span>
        </div>
        <button onClick={handleLogout} style={{ fontSize: '0.9rem', color: 'var(--color-danger)' }}>Logout</button>
      </div>
    </header>
  );
}
