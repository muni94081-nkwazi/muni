import { useEffect, useState } from 'react';
import { apiClient } from '@/api/axios.config';
import type { User } from '@/types/user.types';
import { formatDateTime } from '@/utils/formatters';
import { LoadingState } from '@/components/common/LoadingState';

export function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [filtered, setFiltered] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<{ data: User[]; meta: unknown }>('/users', { params: { page: 1, per_page: 50 } })
      .then((res) => {
        const list = Array.isArray(res.data.data) ? res.data.data : [];
        setUsers(list);
        setFiltered(list);
      })
      .catch((err) => setError(err?.message ?? 'Could not load users'))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    let result = users;
    if (roleFilter) result = result.filter((u) => u.roles.includes(roleFilter as never));
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) => `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      );
    }
    setFiltered(result);
  }, [users, search, roleFilter]);

  if (isLoading) return <LoadingState label="Loading users..." />;

  const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
    ROLE_SUPER_ADMIN: { bg: '#f3e5f5', text: '#4a148c' },
    ROLE_ADMIN:       { bg: '#e3f2fd', text: '#1565c0' },
    ROLE_SELLER:      { bg: '#fff3e0', text: '#e65100' },
    ROLE_CUSTOMER:    { bg: '#e8f5e9', text: '#2e7d32' },
  };

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>User Management</h1>
        <p style={{ color: '#666', fontSize: 'var(--text-sm)' }}>{filtered.length} of {users.length} users</p>
      </div>

      {error && (
        <div style={{ background: '#ffebee', color: '#b71c1c', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
          ⚠️ {error} — make sure the admin role is assigned to your account.
        </div>
      )}

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
        {[
          { label: 'Total Users', value: users.length, color: '#131921' },
          { label: 'Customers', value: users.filter((u) => u.roles.includes('ROLE_CUSTOMER' as never)).length, color: '#2e7d32' },
          { label: 'Sellers', value: users.filter((u) => u.roles.includes('ROLE_SELLER' as never)).length, color: '#e65100' },
          { label: 'Active', value: users.filter((u) => u.active).length, color: '#1565c0' },
        ].map((s) => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: '#888', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-4)', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder="Search name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: 'var(--space-2) var(--space-3)', border: '1px solid #ccc', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)', minWidth: 220 }}
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          style={{ padding: 'var(--space-2) var(--space-3)', border: '1px solid #ccc', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)' }}
        >
          <option value="">All roles</option>
          <option value="ROLE_CUSTOMER">Customer</option>
          <option value="ROLE_SELLER">Seller</option>
          <option value="ROLE_ADMIN">Admin</option>
          <option value="ROLE_SUPER_ADMIN">Super Admin</option>
        </select>
        <button onClick={() => { setSearch(''); setRoleFilter(''); }} style={{ padding: 'var(--space-2) var(--space-3)', background: '#f0f0f0', border: '1px solid #ccc', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
          Clear
        </button>
      </div>

      {/* Users table */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 'var(--radius-md)', overflowX: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #e0e0e0' }}>
              {['Avatar', 'Name', 'Email', 'Phone', 'Roles', 'Verified', 'Active', 'Joined', 'Last Login'].map((h) => (
                <th key={h} style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left', fontWeight: 700, fontSize: 'var(--text-xs)', color: '#555', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 'var(--space-8)', textAlign: 'center', color: '#999' }}>
                {error ? 'Could not load users' : 'No users found'}
              </td></tr>
            ) : filtered.map((user, i) => (
              <tr key={user.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: 'var(--space-2) var(--space-4)' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: '#131921', color: '#febd69',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 'var(--text-sm)',
                  }}>
                    {user.firstName?.[0]?.toUpperCase() ?? '?'}
                  </div>
                </td>
                <td style={{ padding: 'var(--space-2) var(--space-4)', fontWeight: 600 }}>
                  {user.firstName} {user.lastName}
                </td>
                <td style={{ padding: 'var(--space-2) var(--space-4)', color: '#007185' }}>{user.email}</td>
                <td style={{ padding: 'var(--space-2) var(--space-4)', color: '#555', fontSize: 'var(--text-xs)' }}>{user.phoneNumber ?? '—'}</td>
                <td style={{ padding: 'var(--space-2) var(--space-4)' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {user.roles.map((role) => {
                      const rc = ROLE_COLORS[role] ?? { bg: '#f0f0f0', text: '#333' };
                      return (
                        <span key={role} style={{ background: rc.bg, color: rc.text, fontSize: 'var(--text-xs)', fontWeight: 700, padding: '1px 6px', borderRadius: 999 }}>
                          {role.replace('ROLE_', '')}
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td style={{ padding: 'var(--space-2) var(--space-4)', textAlign: 'center' }}>
                  <span style={{ color: user.emailVerified ? '#2e7d32' : '#b71c1c', fontWeight: 700 }}>
                    {user.emailVerified ? '✓' : '✗'}
                  </span>
                </td>
                <td style={{ padding: 'var(--space-2) var(--space-4)', textAlign: 'center' }}>
                  <span style={{ color: user.active ? '#2e7d32' : '#b71c1c', fontWeight: 700 }}>
                    {user.active ? '✓' : '✗'}
                  </span>
                </td>
                <td style={{ padding: 'var(--space-2) var(--space-4)', fontSize: 'var(--text-xs)', color: '#888', whiteSpace: 'nowrap' }}>
                  {formatDateTime(user.createdAt)}
                </td>
                <td style={{ padding: 'var(--space-2) var(--space-4)', fontSize: 'var(--text-xs)', color: '#888', whiteSpace: 'nowrap' }}>
                  {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
