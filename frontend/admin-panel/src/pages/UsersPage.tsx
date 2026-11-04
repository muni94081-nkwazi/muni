import React from 'react';
import { UserFilters } from '../components/users/UserFilters';
import { UserList } from '../components/users/UserList';
import { SellerVerification } from '../components/users/SellerVerification';

export const UsersPage: React.FC = () => (
  <div style={{ padding: 'var(--space-4)' }}>
    <h1>User Management</h1>
    <UserFilters />
    <UserList />
    <h2 style={{ marginTop: 'var(--space-6)' }}>Pending Seller Verifications</h2>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-4)' }}>
      <SellerVerification />
    </div>
  </div>
);
