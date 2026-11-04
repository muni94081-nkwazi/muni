import React from 'react';
import { SearchBar } from '../common/SearchBar';

export const UserFilters: React.FC = () => {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
      <div style={{ flex: 1 }}>
        <SearchBar onSearch={() => {}} placeholder="Search users by name or email..." />
      </div>
      <select style={{ padding: '8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
        <option>All Roles</option>
        <option>CUSTOMER</option>
        <option>SELLER</option>
        <option>ADMIN</option>
      </select>
      <select style={{ padding: '8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
        <option>All Status</option>
        <option>Active</option>
        <option>Suspended</option>
      </select>
    </div>
  );
};
