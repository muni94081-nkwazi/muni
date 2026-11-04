import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import { showToast, setLowDataMode } from '@/store/slices/uiSlice';
import { Input } from '@/components/common/Input/Input';
import { Button } from '@/components/common/Button/Button';
import { authApi } from '@/api/auth.api';
import { isValidUgandanPhone, passwordStrengthMessage } from '@/utils/validators';
import { errorMessage } from '@/utils/helpers';

export function ProfilePage() {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const isLowDataMode = useAppSelector((state) => state.ui.isLowDataMode);

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber ?? '');
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  if (!user) return null;

  async function handleProfileSubmit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (phoneNumber && !isValidUgandanPhone(phoneNumber)) next.phoneNumber = 'Enter a valid Ugandan phone number';
    setProfileErrors(next);
    if (Object.keys(next).length > 0) return;

    setIsSavingProfile(true);
    try {
      await authApi.updateProfile({ firstName, lastName, phoneNumber: phoneNumber || undefined });
      dispatch(showToast('Profile updated', 'success'));
    } catch (error) {
      dispatch(showToast(errorMessage(error, 'Could not update your profile'), 'error'));
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    const issue = passwordStrengthMessage(newPassword);
    if (issue) {
      setPasswordError(issue);
      return;
    }
    setPasswordError(null);

    setIsSavingPassword(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      dispatch(showToast('Password changed', 'success'));
      setCurrentPassword('');
      setNewPassword('');
    } catch (error) {
      dispatch(showToast(errorMessage(error, 'Could not change your password'), 'error'));
    } finally {
      setIsSavingPassword(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)', maxWidth: 480 }}>
      <section>
        <h1 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-4)' }}>Your profile</h1>
        <form onSubmit={handleProfileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <Input label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <Input label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <Input label="Email" value={user.email} disabled hint="Email cannot be changed" />
          <Input
            label="Phone number"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            error={profileErrors.phoneNumber}
          />
          <Button type="submit" isLoading={isSavingProfile} style={{ alignSelf: 'flex-start' }}>
            Save changes
          </Button>
        </form>
      </section>

      <section>
        <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-4)' }}>Change password</h2>
        <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Input
            label="Current password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <Input
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            error={passwordError ?? undefined}
            required
          />
          <Button type="submit" isLoading={isSavingPassword} style={{ alignSelf: 'flex-start' }}>
            Update password
          </Button>
        </form>
      </section>

      <section>
        <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-4)' }}>Data & connectivity</h2>
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--space-3)',
            padding: 'var(--space-4)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={isLowDataMode}
            onChange={(e) => {
              dispatch(setLowDataMode(e.target.checked));
              dispatch(showToast(e.target.checked ? 'Low-Data Mode on' : 'Low-Data Mode off', 'success'));
            }}
            style={{ marginTop: 2 }}
          />
          <span>
            <span style={{ display: 'block', fontWeight: 600, fontSize: 'var(--text-sm)' }}>Low-Data Mode</span>
            <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>
              Loads compressed images, skips high-res banners, and disables autoplaying media
              — recommended on slow or metered connections.
            </span>
          </span>
        </label>
      </section>

      {/* Legal. The footer already carries these links site-wide, but a signed-in
          user managing their account should not have to scroll to the bottom of
          the page to find the documents they agreed to. Same routes, no new
          pages. */}
      <section>
        <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-4)' }}>Legal</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
          The documents that govern your MUNI account.
        </p>
        <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)' }} aria-label="Legal">
          <Link to="/conditions" style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
            Conditions of Use
          </Link>
          <Link to="/privacy" style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
            Privacy Notice
          </Link>
        </nav>
      </section>
    </div>
  );
}
