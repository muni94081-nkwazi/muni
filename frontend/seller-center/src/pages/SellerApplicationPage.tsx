import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../router/routes';
import { Button } from '../components/common/Button/Button';
import { Input } from '../components/common/Input/Input';
import { useAppDispatch, useAppSelector } from '../store/hooks/useAppSelector';
import { fetchCurrentUserThunk, logoutThunk, selectUser } from '../store/slices/authSlice';
import { sellerApi, type SellerProfile } from '../api/seller.api';
import {
  EMPTY_APPLICATION,
  describeApiError,
  hasSellerAccess,
  presentStatus,
  toApplicationPayload,
  validateApplication,
  type ApplicationFormValues,
} from '../utils/sellerApplication';

// ─── Become a seller ──────────────────────────────────────────────────────────
//
// The step that was missing between "created an account" and "has ROLE_SELLER".
// RegisterPage creates a user; an admin grants the seller role; this is where
// the application in between actually gets filed.
//
// The backend is the authority on status throughout. This page reads
// GET /sellers/me on mount rather than remembering anything locally, so a
// seller returning later sees what the database says, not what this browser
// last believed.

const TONE_COLOR: Record<string, string> = {
  pending: 'var(--color-warning, #b7791f)',
  success: 'var(--color-success, #2f7a4d)',
  error:   'var(--color-danger, #c53030)',
  warning: 'var(--color-warning, #b7791f)',
};

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: '100%', maxWidth: 720, backgroundColor: 'var(--color-surface)',
      padding: 'var(--spacing-8)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)',
    }}>
      {children}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'var(--color-sidebar-bg)', padding: 'var(--spacing-6) var(--spacing-4)',
    }}>
      {children}
    </div>
  );
}

export const SellerApplicationPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);

  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [values, setValues] = useState<ApplicationFormValues>(EMPTY_APPLICATION);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  /** The database is the source of truth for status — always re-read it. */
  const loadStatus = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setProfile(await sellerApi.getMyApplication());
    } catch (err) {
      setLoadError(describeApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const set = (field: keyof ApplicationFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setValues((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return; // guards against a double click filing twice

    const errors = validateApplication(values);
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const result = await sellerApi.apply(toApplicationPayload(values));
      setProfile(result.seller);
      setJustSubmitted(true);
    } catch (err) {
      const { status, message } = describeApiError(err);
      setFormError(message);
      // 409 means a profile already exists — show its real status instead of
      // leaving the seller staring at an error they cannot act on.
      if (status === 409) await loadStatus();
      if (status === 401) {
        // The session is gone; the form cannot succeed until they sign in.
        setFormError(`${message}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = async () => {
    await dispatch(logoutThunk());
    navigate(ROUTES.LOGIN);
  };

  // ── Already a seller ───────────────────────────────────────────────────────
  if (hasSellerAccess(user?.roles)) {
    return (
      <Shell>
        <Card>
          <h2 style={{ marginBottom: 'var(--spacing-2)' }}>You are already a seller</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--spacing-6)' }}>
            This account already has seller access, so there is nothing to apply for.
          </p>
          <Button fullWidth onClick={() => navigate(ROUTES.DASHBOARD)}>Go to Seller Center</Button>
        </Card>
      </Shell>
    );
  }

  if (loading) {
    return <Shell><Card><p>Checking your application status…</p></Card></Shell>;
  }

  // ── Existing application → show its real status ────────────────────────────
  if (profile) {
    const status = presentStatus(profile);
    return (
      <Shell>
        <Card>
          <p style={{
            fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase',
            color: TONE_COLOR[status.tone], fontWeight: 700, marginBottom: 'var(--spacing-2)',
          }}>
            {profile.verificationStatus}
          </p>
          <h2 style={{ marginBottom: 'var(--spacing-2)' }}>{status.title}</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--spacing-6)' }}>
            {justSubmitted ? 'Thank you — your application has been received. ' : ''}{status.detail}
          </p>

          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'var(--spacing-2) var(--spacing-4)', fontSize: '0.875rem', marginBottom: 'var(--spacing-6)' }}>
            <dt style={{ color: 'var(--color-text-secondary)' }}>Business</dt>
            <dd style={{ margin: 0 }}>{profile.businessName}</dd>
            {profile.storeName && (<>
              <dt style={{ color: 'var(--color-text-secondary)' }}>Store</dt>
              <dd style={{ margin: 0 }}>{profile.storeName}</dd>
            </>)}
            <dt style={{ color: 'var(--color-text-secondary)' }}>Submitted</dt>
            <dd style={{ margin: 0 }}>{new Date(profile.createdAt).toLocaleDateString()}</dd>
            <dt style={{ color: 'var(--color-text-secondary)' }}>Documents</dt>
            <dd style={{ margin: 0 }}>{profile.documents?.length ?? 0} uploaded</dd>
          </dl>

          <div style={{ display: 'flex', gap: 'var(--spacing-3)', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => void loadStatus()}>Refresh status</Button>
            {status.canReapply && (
              <Button onClick={() => { setProfile(null); setJustSubmitted(false); }}>
                Update and resubmit
              </Button>
            )}
            {profile.verificationStatus === 'verified' && (
              <Button onClick={() => void dispatch(fetchCurrentUserThunk())}>Refresh my access</Button>
            )}
            <Button variant="ghost" onClick={signOut}>Sign out</Button>
          </div>
        </Card>
      </Shell>
    );
  }

  // ── No application yet → the form ──────────────────────────────────────────
  return (
    <Shell>
      <Card>
        <h2 style={{ marginBottom: 'var(--spacing-2)' }}>Become a MUNI seller</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--spacing-6)' }}>
          Signed in as {user?.email}. Tell us about your business and a MUNI administrator will
          review your application. Seller Center access is granted once it is approved.
        </p>

        {loadError && (
          <p role="alert" style={{ color: TONE_COLOR.error, fontSize: '0.875rem', marginBottom: 'var(--spacing-4)' }}>
            {loadError}
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <h3 style={{ fontSize: '0.95rem', marginBottom: 'var(--spacing-3)' }}>Business details</h3>
          <Input label="Business name" value={values.businessName} onChange={set('businessName')} error={fieldErrors.businessName} required />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-1)', marginBottom: 'var(--spacing-4)' }}>
            <label htmlFor="businessType" style={{ fontSize: '0.875rem', fontWeight: 500 }}>Business type *</label>
            <select
              id="businessType" value={values.businessType} onChange={set('businessType')}
              style={{ padding: 'var(--spacing-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
            >
              <option value="individual">Individual / sole trader</option>
              <option value="company">Company</option>
              <option value="partnership">Partnership</option>
            </select>
          </div>

          <Input label="Tax identification number" value={values.taxId} onChange={set('taxId')} error={fieldErrors.taxId} />
          <Input label="Business registration number" value={values.registrationNumber} onChange={set('registrationNumber')} />
          <Input label="Business email" type="email" value={values.businessEmail} onChange={set('businessEmail')} error={fieldErrors.businessEmail} />
          <Input label="Business phone" value={values.businessPhone} onChange={set('businessPhone')} />

          <h3 style={{ fontSize: '0.95rem', margin: 'var(--spacing-6) 0 var(--spacing-3)' }}>Business address</h3>
          <Input label="Street address" value={values.street} onChange={set('street')} error={fieldErrors.street} required />
          <Input label="City" value={values.city} onChange={set('city')} error={fieldErrors.city} required />
          <Input label="Region / district" value={values.region} onChange={set('region')} />
          <Input label="Country code" value={values.country} onChange={set('country')} error={fieldErrors.country} maxLength={2} required />
          <Input label="Postal code" value={values.postalCode} onChange={set('postalCode')} />

          <h3 style={{ fontSize: '0.95rem', margin: 'var(--spacing-6) 0 var(--spacing-2)' }}>Payout details</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-3)' }}>
            Sensitive. Used only to pay out your sales, and shown back to you masked. Never share
            these details with anyone claiming to be MUNI support.
          </p>
          <Input label="Account holder name" value={values.accountName} onChange={set('accountName')} error={fieldErrors.accountName} required />
          <Input label="Bank name" value={values.bankName} onChange={set('bankName')} error={fieldErrors.bankName} required />
          <Input
            label="Account number" value={values.accountNumber} onChange={set('accountNumber')}
            error={fieldErrors.accountNumber} autoComplete="off" required
          />
          <Input label="SWIFT / BIC code" value={values.swiftCode} onChange={set('swiftCode')} autoComplete="off" />

          <h3 style={{ fontSize: '0.95rem', margin: 'var(--spacing-6) 0 var(--spacing-3)' }}>Your storefront</h3>
          <Input label="Store name" value={values.storeName} onChange={set('storeName')} error={fieldErrors.storeName} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-1)', marginBottom: 'var(--spacing-4)' }}>
            <label htmlFor="storeDescription" style={{ fontSize: '0.875rem', fontWeight: 500 }}>Store description</label>
            <textarea
              id="storeDescription" value={values.storeDescription} onChange={set('storeDescription')}
              rows={3} maxLength={500}
              style={{ padding: 'var(--spacing-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontFamily: 'inherit' }}
            />
            {fieldErrors.storeDescription && (
              <span style={{ color: TONE_COLOR.error, fontSize: '0.75rem' }}>{fieldErrors.storeDescription}</span>
            )}
          </div>

          {formError && (
            <p role="alert" style={{ color: TONE_COLOR.error, fontSize: '0.875rem', marginBottom: 'var(--spacing-4)' }}>
              {formError}
            </p>
          )}

          <Button type="submit" fullWidth isLoading={submitting} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit application'}
          </Button>
        </form>

        <div style={{ marginTop: 'var(--spacing-4)', textAlign: 'center' }}>
          <Button variant="ghost" onClick={signOut}>Sign out</Button>
        </div>
      </Card>
    </Shell>
  );
};

export default SellerApplicationPage;
