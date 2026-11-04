import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '../router/routes';
import { Button } from '../components/common/Button/Button';
import { Input } from '../components/common/Input/Input';
import { SocialButton, SocialDivider, type SocialProvider } from '../components/common/SocialButton/SocialButton';
import { useAppDispatch, useAppSelector } from '../store/hooks/useAppSelector';
import { registerThunk, selectAuthError, selectAuthStatus } from '../store/slices/authSlice';
import { API_BASE_URL } from '../utils/constants';

// Same as LoginPage: all three providers have real OAuth routes now.
const WORKING_PROVIDERS: SocialProvider[] = ['google', 'facebook', 'apple'];

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectAuthStatus);
  const error = useAppSelector(selectAuthError);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [businessName, setBusinessName] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await dispatch(
      registerThunk({ firstName, lastName, email, password, phoneNumber: phoneNumber || undefined }),
    );
    if (registerThunk.fulfilled.match(result)) {
      // Account creation only. Approving `businessName` as a seller requires the
      // richer /sellers/register application (business address, bank account) —
      // that's a separate step once the seller is signed in. We keep the name
      // here so a future "complete your seller profile" step has it on hand.
      navigate(ROUTES.LOGIN, { state: { registered: true, businessName } });
    }
  };

  const handleSocial = (provider: SocialProvider) => {
    window.location.href = `${API_BASE_URL}/auth/${provider}?state=${encodeURIComponent(ROUTES.DASHBOARD)}`;
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-sidebar-bg)', padding: 'var(--spacing-6) 0' }}>
      <div style={{ width: '100%', maxWidth: '440px', backgroundColor: 'var(--color-surface)', padding: 'var(--spacing-8)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 'var(--spacing-2)', color: 'var(--color-text-primary)' }}>Become a Muni Seller</h2>
        <p style={{ textAlign: 'center', marginBottom: 'var(--spacing-6)', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
          Create your account to start selling on Muni.ug
        </p>

        {error && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--spacing-4)', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)' }}>
            <Input label="First name" required value={firstName} onChange={e => setFirstName(e.target.value)} />
            <Input label="Last name" required value={lastName} onChange={e => setLastName(e.target.value)} />
          </div>
          <Input label="Email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
          <Input
            label="Password"
            type="password"
            required
            minLength={12}
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <Input label="Phone number" type="tel" placeholder="+256 7XX XXX XXX" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} />
          <Input label="Business name" required value={businessName} onChange={e => setBusinessName(e.target.value)} />

          <Button type="submit" fullWidth isLoading={status === 'loading'} style={{ marginTop: 'var(--spacing-2)' }}>
            Create account
          </Button>
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
          Already have an account? <Link to={ROUTES.LOGIN} style={{ color: 'var(--color-accent)' }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
