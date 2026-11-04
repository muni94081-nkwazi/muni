import React from 'react';
import { Table } from '../common/Table/Table';
import { Badge } from '../common/Badge/Badge';
import { Button } from '../common/Button/Button';

export const UserList: React.FC = () => {
  const users = [
    { id: 1, name: 'John Kizza', email: 'john@example.com', role: 'CUSTOMER', date: '2023-10-01', status: 'Active' },
    { id: 2, name: 'Sarah Namukasa', email: 'sarah@organics.ug', role: 'SELLER', date: '2023-09-15', status: 'Active' },
    { id: 3, name: 'Peter Okello', email: 'peter@example.com', role: 'CUSTOMER', date: '2023-10-05', status: 'Suspended' },
  ];

  const columns = [
    {
      key: 'user', label: 'User', render: (u: any) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--color-info)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {u.name.charAt(0)}
          </div>
          <div>
            <div style={{ fontWeight: 500 }}>{u.name}</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{u.email}</div>
          </div>
        </div>
      )
    },
    { key: 'role', label: 'Role', render: (u: any) => <Badge variant={u.role === 'ADMIN' ? 'danger' : u.role === 'SELLER' ? 'info' : 'active'}>{u.role}</Badge> },
    { key: 'date', label: 'Joined' },
    { key: 'status', label: 'Status', render: (u: any) => <Badge variant={u.status === 'Active' ? 'active' : 'suspended'}>{u.status}</Badge> },
    { key: 'actions', label: 'Actions', render: () => <Button size="sm" variant="outline">View</Button> }
  ];

  return <Table columns={columns} data={users} />;
};
