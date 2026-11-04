import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '../router/routes';
import { Button } from '../components/common/Button/Button';
import { Input } from '../components/common/Input/Input';
import { SocialButton, SocialDivider, type SocialProvider } from '../components/common/SocialButton/SocialButton';
import { useAppDispatch, useAppSelector } from '../store/hooks/useAppSelector';
import { loginThunk, selectAuthError, selectAuthStatus } from '../store/slices/authSlice';
import { API_BASE_URL } from '../utils/constants';

// Google, Facebook, and Apple all have working OAuth flows on the backend
// (auth-service's oauth.controller.ts). Each still needs real provider
// credentials in .env before it will actually complete a login — an
// unconfigured provider redirects and then fails with a 501 from the
// backend, rather than silently doing nothing.
const WORKING_PROVIDERS: SocialProvider[] = ['google', 'facebook', 'apple'];

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectAuthStatus);
  const error = useAppSelector(selectAuthError);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const justRegistered = (location.state as { registered?: boolean } | null)?.registered;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await dispatch(loginThunk({ email, password }));
    if (!loginThunk.fulfilled.match(result)) return;

    // /auth/login answers with one of three shapes. Only the first is a
    // session; the other two are steps still to complete, and treating them as
    // a failed login is what left a newly-approved seller stuck on this page
    // with no explanation.
    const payload = result.payload as {
      status?: string;
      accessToken?: string;
      enrollmentToken?: string;
      challengeToken?: string;
      user?: { roles?: string[] };
    };

    // Seller and admin accounts must hold a second factor before they may hold
    // a session at all. The enrolment credential travels in router state, not
    // storage — it is valid for five minutes and for two calls.
    if (payload.status === 'MFA_ENROLLMENT_REQUIRED' && payload.enrollmentToken) {
      navigate(ROUTES.MFA_SETUP, { state: { enrollmentToken: payload.enrollmentToken } });
      return;
    }

    if (payload.status === 'MFA_REQUIRED' && payload.challengeToken) {
      navigate(ROUTES.MFA_VERIFY, { state: { challengeToken: payload.challengeToken } });
      return;
    }

    // Send an account that is not yet a seller to the application rather than
    // to the dashboard, which PrivateRoute would immediately bounce to
    // /unauthorized. The role on the login response is the backend's, so this
    // only changes where the user lands — never what they are allowed to do.
    const roles = payload.user?.roles ?? [];
    navigate(roles.includes('ROLE_SELLER') ? ROUTES.DASHBOARD : ROUTES.APPLY);
  };

  const handleSocial = (provider: SocialProvider) => {
    // Full-page redirect, not a fetch — the browser needs to leave the SPA
    // for Google's consent screen, then Google redirects back to the
    // backend's callback, which redirects here with tokens.
    window.location.href = `${API_BASE_URL}/auth/${provider}?state=${encodeURIComponent(ROUTES.DASHBOARD)}`;
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-sidebar-bg)' }}>
      <div style={{ width: '100%', maxWidth: '400px', backgroundColor: 'var(--color-surface)', padding: 'var(--spacing-8)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 'var(--spacing-6)', color: 'var(--color-text-primary)' }}>MUNI Seller Center</h2>

        {justRegistered && (
          <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--spacing-4)', fontSize: '0.85rem' }}>
            Account created. Sign in below — your seller application will be reviewed within 2-3 business days.
          </div>
        )}

        {error && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--spacing-4)', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <Input label="Email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
          <Input label="Password" type="password" required value={password} onChange={e => setPassword(e.target.value)} />
          <Button type="submit" fullWidth isLoading={status === 'loading'}>Login</Button>
        </form>

        <SocialDivider />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          {(['google', 'apple', 'facebook'] as SocialProvider[]).map((provider) => (
            <SocialButton
              key={provider}
              provider={provider}
              disabled={!WORKING_PROVIDERS.includes(provider)}
              onClick={() => handleSocial(provider)}
            />
          ))}
        </div>

        <p style={{ textAlign: 'center', marginTop: 'var(--spacing-4)', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
          New seller? <Link to={ROUTES.REGISTER} style={{ color: 'var(--color-accent)' }}>Create an account</Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
