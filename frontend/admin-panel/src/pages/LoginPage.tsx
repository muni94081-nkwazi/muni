import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginThunk } from '../store/slices/authSlice';
import { useAppDispatch } from '../store/hooks/useAppSelector';

export function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await dispatch(loginThunk({ email, password })).unwrap();
      navigate('/');
    } catch (err: any) {
      setError(err || 'Login failed');
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
      <form onSubmit={handleSubmit} className="card" style={{ width: 400, padding: 'var(--space-6)' }}>
        <h2 style={{ marginBottom: 'var(--space-5)', textAlign: 'center' }}>MUNI Admin Login</h2>
        {error && <div style={{ color: 'var(--color-danger)', marginBottom: '16px' }}>{error}</div>}
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <label style={{ display: 'block', marginBottom: '8px' }}>Email</label>
          <input 
            type="email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}
            required
          />
        </div>
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <label style={{ display: 'block', marginBottom: '8px' }}>Password</label>
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}
            required
          />
        </div>
        <button type="submit" style={{ width: '100%', padding: '12px', background: 'var(--color-accent)', color: '#fff', borderRadius: 'var(--radius-sm)', fontWeight: 'bold' }}>
          Login
        </button>
      </form>
    </div>
  );
}
