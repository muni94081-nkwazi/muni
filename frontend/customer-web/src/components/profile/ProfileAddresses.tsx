import { useCallback, useEffect, useState } from 'react';
import { addressesApi } from '@/api/addresses.api';
import type { CreateAddressInput, SavedAddress } from '@/types/address.types';

// Backed by user-service's address book. This component previously held two
// hardcoded addresses in local state and a "Set as default" button that only
// reordered them in memory — nothing was ever read from or written to the
// server, so the list looked identical for every account and reset on reload.

const EMPTY_FORM: CreateAddressInput = {
  contactName: '',
  contactPhone: '',
  region: '',
  district: '',
  addressLine: '',
  landmark: '',
};

// Matches user-service's contactPhoneRegex: optional +, then 7-15 digits.
const PHONE_RE = /^\+?\d{7,15}$/;

function describe(err: unknown, fallback: string): string {
  const body = (err as { response?: { data?: { message?: string } } })?.response?.data;
  return body?.message ?? (err instanceof Error ? err.message : fallback);
}

export function ProfileAddresses() {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateAddressInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAddresses(await addressesApi.list());
    } catch (err) {
      setError(describe(err, 'Could not load your saved addresses'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The server enforces exactly one default inside a transaction and returns
  // the updated row, so the list is refetched rather than patched locally —
  // the address that LOST default status is not in that response.
  async function handleSetDefault(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await addressesApi.setDefault(id);
      await load();
    } catch (err) {
      setError(describe(err, 'Could not set that address as default'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await addressesApi.remove(id);
      setAddresses((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(describe(err, 'Could not delete that address'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    // Mirrors the server validator so the common mistakes are caught without a
    // round trip; the server remains the authority.
    if (!form.contactName.trim()) return setFormError('Contact name is required');
    if (!PHONE_RE.test(form.contactPhone.trim())) {
      return setFormError('Enter a valid phone number, e.g. +256700000000');
    }
    if (!form.addressLine.trim()) return setFormError('Street address is required');
    if (!form.region.trim()) return setFormError('Region is required');
    if (!form.district.trim()) return setFormError('District is required');

    setSaving(true);
    try {
      const created = await addressesApi.create({
        ...form,
        contactName: form.contactName.trim(),
        contactPhone: form.contactPhone.trim(),
        addressLine: form.addressLine.trim(),
        region: form.region.trim(),
        district: form.district.trim(),
        // Omit rather than send empty strings — the validator caps length but
        // an empty landmark is noise on the record.
        landmark: form.landmark?.trim() || undefined,
      });
      // A new default demotes another row, so refetch in that case.
      if (created.isDefault) await load();
      else setAddresses((prev) => [...prev, created]);
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err) {
      // Includes the "at most N addresses" cap from user-service.
      setFormError(describe(err, 'Could not save that address'));
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof CreateAddressInput, label: string, placeholder?: string) => (
    <label style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
      <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 2 }}>
        {label}
      </span>
      <input
        value={(form[key] as string) ?? ''}
        placeholder={placeholder}
        onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
        style={{
          width: '100%', padding: 'var(--space-2)',
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--text-sm)',
        }}
      />
    </label>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>Saved Addresses</h3>
        <button
          onClick={() => { setShowForm((v) => !v); setFormError(null); }}
          style={{ fontSize: 'var(--text-sm)', color: 'var(--color-interactive)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {showForm ? 'Cancel' : '+ Add address'}
        </button>
      </div>

      {error && (
        <div role="alert" style={{ marginBottom: 'var(--space-3)', padding: 'var(--space-3)', background: '#f8d7da', color: '#842029', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)' }}>
          {error}{' '}
          <button onClick={() => void load()} style={{ background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
          {field('contactName', 'Contact name')}
          {field('contactPhone', 'Contact phone', '+256700000000')}
          {field('addressLine', 'Street address')}
          {field('region', 'Region')}
          {field('district', 'District')}
          {field('landmark', 'Landmark (optional)')}

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', margin: 'var(--space-2) 0' }}>
            <input
              type="checkbox"
              checked={!!form.isDefault}
              onChange={(e) => setForm((prev) => ({ ...prev, isDefault: e.target.checked }))}
            />
            Make this my default delivery address
          </label>

          {formError && (
            <p style={{ color: '#842029', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)' }}>{formError}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{ padding: 'var(--space-2) var(--space-4)', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: saving ? 'default' : 'pointer', fontWeight: 700 }}
          >
            {saving ? 'Saving…' : 'Save address'}
          </button>
        </form>
      )}

      {loading && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Loading addresses…</p>}

      {!loading && addresses.length === 0 && !error && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
          You have no saved addresses yet.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {addresses.map((addr) => (
          <div
            key={addr.id}
            style={{
              padding: 'var(--space-4)', background: 'var(--color-surface)',
              border: `1px solid ${addr.isDefault ? 'var(--color-primary)' : 'var(--color-border)'}`,
              borderRadius: 'var(--radius-md)', position: 'relative',
              opacity: busyId === addr.id ? 0.6 : 1,
            }}
          >
            {addr.isDefault && (
              <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, background: 'var(--color-primary)', color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                DEFAULT
              </span>
            )}
            <p style={{ fontWeight: 700, fontSize: 'var(--text-sm)', marginBottom: 'var(--space-1)' }}>
              {addr.contactName}
              <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}> · {addr.type.toLowerCase()}</span>
            </p>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
              {[addr.addressLine, addr.ward, addr.district, addr.region, addr.country].filter(Boolean).join(', ')}
            </p>
            {addr.landmark && (
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Near {addr.landmark}</p>
            )}
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{addr.contactPhone}</p>

            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
              {!addr.isDefault && (
                <button
                  onClick={() => void handleSetDefault(addr.id)}
                  disabled={busyId === addr.id}
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--color-interactive)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Set as default
                </button>
              )}
              <button
                onClick={() => void handleRemove(addr.id)}
                disabled={busyId === addr.id}
                style={{ fontSize: 'var(--text-xs)', color: '#842029', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
