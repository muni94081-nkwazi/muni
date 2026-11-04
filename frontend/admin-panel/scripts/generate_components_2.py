import os

base_dir = r"c:\PROJECTS\Projects\MUNI\frontend\admin-panel\src"

def write_file(filepath, content):
    full_path = os.path.join(base_dir, filepath)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")

# Dashboard Components
write_file("components/dashboard/PlatformStats.tsx", """
import React from 'react';
import { StatCard } from '../common/StatCard';

export const PlatformStats: React.FC = () => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
      <StatCard label="Total GMV" value="UGX 284.5M" icon="💰" trend="+12%" colorVariant="#e94560" />
      <StatCard label="Active Users" value="12,847" icon="👥" trend="+5%" colorVariant="#0984e3" />
      <StatCard label="Active Sellers" value="342" icon="🏪" trend="+2%" colorVariant="#00b894" />
      <StatCard label="Total Orders" value="8,931" icon="📦" trend="+8%" colorVariant="#fdcb6e" />
      <StatCard label="Open Disputes" value="23" icon="⚖️" trend="-15%" colorVariant="#d63031" />
      <StatCard label="Platform Revenue" value="UGX 28.4M" icon="📈" trend="+10%" colorVariant="#6c5ce7" />
    </div>
  );
};
""")

write_file("components/dashboard/GMVChart.tsx", """
import React from 'react';

export const GMVChart: React.FC = () => {
  const data = [
    { month: 'Jul', value: 45 },
    { month: 'Aug', value: 60 },
    { month: 'Sep', value: 55 },
    { month: 'Oct', value: 80 },
    { month: 'Nov', value: 95 },
    { month: 'Dec', value: 110 },
  ];
  const max = Math.max(...data.map(d => d.value));

  return (
    <div style={{ backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
      <h3 style={{ margin: '0 0 var(--space-4) 0' }}>Monthly GMV (Jul - Dec)</h3>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '200px', marginTop: 'var(--space-4)' }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ 
              width: '100%', 
              backgroundColor: 'var(--color-accent)', 
              height: `${(d.value / max) * 100}%`,
              borderRadius: '4px 4px 0 0',
              transition: 'height 0.3s'
            }} title={`UGX ${(d.value * 2.5).toFixed(1)}M`} />
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{d.month}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
""")

write_file("components/dashboard/RecentActivity.tsx", """
import React from 'react';

export const RecentActivity: React.FC = () => {
  const activities = [
    { icon: '🛒', text: 'New seller "Kampala Organics" registered', time: '2 min ago' },
    { icon: '🚨', text: 'Product flagged: "Fake branded shoes"', time: '15 min ago' },
    { icon: '✅', text: 'Dispute #D-0045 resolved: Refund issued', time: '1 hr ago' },
    { icon: '👤', text: 'New customer from Jinja registered', time: '2 hr ago' },
    { icon: '📦', text: 'Order #MUNI-000234 delivered', time: '3 hr ago' },
    { icon: '⚠️', text: 'Low stock alert: 5 products from "Fresh Farm Uganda"', time: '4 hr ago' },
    { icon: '🆕', text: 'New seller application: "Gulu Electronics"', time: '5 hr ago' },
    { icon: '💳', text: 'Payment processed: UGX 380,000', time: '6 hr ago' },
  ];

  return (
    <div style={{ backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
      <h3 style={{ margin: '0 0 var(--space-4) 0' }}>Recent Activity</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {activities.map((act, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>{act.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>{act.text}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{act.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
""")

write_file("components/dashboard/QuickActions.tsx", """
import React from 'react';
import { Button } from '../common/Button/Button';
import { Badge } from '../common/Badge/Badge';

export const QuickActions: React.FC = () => {
  return (
    <div style={{ backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
      <h3 style={{ margin: '0 0 var(--space-4) 0' }}>Quick Actions</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Button variant="outline" fullWidth style={{ justifyContent: 'space-between' }}>
          Review Pending Products <Badge variant="pending">12</Badge>
        </Button>
        <Button variant="outline" fullWidth style={{ justifyContent: 'space-between' }}>
          Resolve Open Disputes <Badge variant="danger">23</Badge>
        </Button>
        <Button variant="outline" fullWidth style={{ justifyContent: 'space-between' }}>
          Pending Seller Verifications <Badge variant="info">8</Badge>
        </Button>
        <Button variant="primary" fullWidth>
          Send Announcement
        </Button>
      </div>
    </div>
  );
};
""")

write_file("components/users/UserList.tsx", """
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
""")

write_file("components/users/UserDetails.tsx", """
import React from 'react';
import { Badge } from '../common/Badge/Badge';
import { Button } from '../common/Button/Button';

export const UserDetails: React.FC<{ userId?: string }> = ({ userId }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--color-info)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>S</div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: '0 0 4px 0' }}>Sarah Namukasa</h2>
          <div style={{ color: 'var(--color-text-secondary)', marginBottom: '8px' }}>sarah@organics.ug</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Badge variant="info">SELLER</Badge>
            <Badge variant="active">Active</Badge>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="danger">Suspend</Button>
          <Button variant="outline">Reset Password</Button>
        </div>
      </div>
    </div>
  );
};
""")

write_file("components/users/SellerVerification.tsx", """
import React from 'react';
import { Button } from '../common/Button/Button';

export const SellerVerification: React.FC = () => {
  return (
    <div style={{ backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
      <h3 style={{ margin: '0 0 var(--space-4) 0' }}>Kampala Organics</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>Business Type</div>
          <div>Sole Proprietorship</div>
        </div>
        <div>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>TIN Number</div>
          <div>1002345678</div>
        </div>
      </div>
      <div style={{ padding: 'var(--space-3)', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-4)' }}>
        📄 Business Registration Certificate submitted
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Button variant="primary">Approve</Button>
        <Button variant="danger">Reject</Button>
      </div>
    </div>
  );
};
""")

write_file("components/users/UserFilters.tsx", """
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
""")
