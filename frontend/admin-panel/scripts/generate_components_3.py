import os

base_dir = r"c:\PROJECTS\Projects\MUNI\frontend\admin-panel\src"

def write_file(filepath, content):
    full_path = os.path.join(base_dir, filepath)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")

# Products Components
write_file("components/products/ProductList.tsx", """
import React from 'react';
import { Table } from '../common/Table/Table';
import { Badge } from '../common/Badge/Badge';
import { Button } from '../common/Button/Button';

export const ProductList: React.FC = () => {
  const products = [
    { id: 1, name: 'Organic Honey 500g', seller: 'Kampala Organics', category: 'Food & Grocery', price: 'UGX 15,000', status: 'approved' },
    { id: 2, name: 'Fake Branded Shoes', seller: 'Downtown Kicks', category: 'Fashion', price: 'UGX 50,000', status: 'flagged' },
    { id: 3, name: 'Solar Lantern', seller: 'Gulu Electronics', category: 'Home', price: 'UGX 85,000', status: 'pending' }
  ];

  const columns = [
    { key: 'image', label: '', render: () => <div style={{width:'50px',height:'50px',backgroundColor:'#ccc',borderRadius:'4px'}}></div> },
    { key: 'name', label: 'Product Name' },
    { key: 'seller', label: 'Seller' },
    { key: 'category', label: 'Category' },
    { key: 'price', label: 'Price' },
    { key: 'status', label: 'Status', render: (p: any) => <Badge variant={p.status}>{p.status}</Badge> },
    { key: 'actions', label: 'Actions', render: () => <Button size="sm" variant="outline">View</Button> }
  ];

  return <Table columns={columns} data={products} />;
};
""")

write_file("components/products/ProductDetails.tsx", """
import React from 'react';
import { Badge } from '../common/Badge/Badge';

export const ProductDetails: React.FC = () => {
  return (
    <div style={{ backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
        <div style={{ width: '200px', height: '200px', backgroundColor: '#e2e3e5', borderRadius: 'var(--radius-md)' }}></div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: '0 0 var(--space-2) 0' }}>Organic Honey 500g</h2>
          <div style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>SKU: HO-500 | Category: Food & Grocery</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--color-accent)', marginBottom: 'var(--space-4)' }}>UGX 15,000</div>
          <p>Pure organic honey harvested from the highlands of Kabale. Natural and unrefined.</p>
          <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3)', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius-sm)' }}>
            <strong>Seller Info:</strong> Kampala Organics (Joined: 2023-01-10)
          </div>
        </div>
      </div>
    </div>
  );
};
""")

write_file("components/products/ProductModeration.tsx", """
import React from 'react';
import { Button } from '../common/Button/Button';
import { Badge } from '../common/Badge/Badge';

export const ProductModeration: React.FC = () => {
  return (
    <div style={{ backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
      <h3 style={{ margin: '0 0 var(--space-4) 0' }}>Moderation Panel</h3>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        Current Status: <Badge variant="pending">Pending Review</Badge>
      </div>
      <textarea 
        placeholder="Add moderation notes..." 
        style={{ width: '100%', height: '100px', padding: '8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: 'var(--space-4)' }} 
      />
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Button variant="primary">Approve Product</Button>
        <Button variant="danger">Reject</Button>
        <Button variant="outline">Flag for investigation</Button>
        <Button variant="ghost">Save Notes</Button>
      </div>
    </div>
  );
};
""")

write_file("components/products/ProductFlagged.tsx", """
import React from 'react';
import { Table } from '../common/Table/Table';
import { Button } from '../common/Button/Button';

export const ProductFlagged: React.FC = () => {
  const data = [
    { id: 2, name: 'Fake Branded Shoes', reason: 'Counterfeit item reported', date: '2023-11-20' }
  ];
  const cols = [
    { key: 'name', label: 'Product Name' },
    { key: 'reason', label: 'Flag Reason' },
    { key: 'date', label: 'Date Flagged' },
    { key: 'actions', label: 'Actions', render: () => (
      <div style={{display:'flex',gap:'8px'}}>
        <Button size="sm" variant="outline">Unflag</Button>
        <Button size="sm" variant="danger">Remove</Button>
      </div>
    )}
  ];
  return <Table columns={cols} data={data} />;
};
""")

# Orders
write_file("components/orders/OrderList.tsx", """
import React from 'react';
import { Table } from '../common/Table/Table';
import { Badge } from '../common/Badge/Badge';
import { Button } from '../common/Button/Button';

export const OrderList: React.FC = () => {
  const data = [
    { id: 'MUNI-000234', date: '2023-12-01', customer: 'John Kizza', seller: 'Kampala Organics', items: 2, total: 'UGX 30,000', status: 'Delivered' },
    { id: 'MUNI-000235', date: '2023-12-02', customer: 'Mary N', seller: 'Gulu Electronics', items: 1, total: 'UGX 85,000', status: 'Processing' }
  ];
  const cols = [
    { key: 'id', label: 'Order #' },
    { key: 'date', label: 'Date' },
    { key: 'customer', label: 'Customer' },
    { key: 'seller', label: 'Seller' },
    { key: 'items', label: 'Items' },
    { key: 'total', label: 'Total' },
    { key: 'status', label: 'Status', render: (o: any) => <Badge variant={o.status === 'Delivered' ? 'active' : 'pending'}>{o.status}</Badge> },
    { key: 'actions', label: 'Actions', render: () => <Button size="sm" variant="outline">View</Button> }
  ];
  return <Table columns={cols} data={data} />;
};
""")

write_file("components/orders/OrderDetails.tsx", """
import React from 'react';
import { Badge } from '../common/Badge/Badge';

export const OrderDetails: React.FC = () => (
  <div style={{ backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
    <h2>Order #MUNI-000234</h2>
    <Badge variant="active">Delivered</Badge>
    <div style={{ marginTop: 'var(--space-4)' }}>
      <strong>Items:</strong> 2x Organic Honey 500g (UGX 30,000)
    </div>
    <div style={{ marginTop: 'var(--space-2)' }}>
      <strong>Shipping to:</strong> Kampala, Uganda
    </div>
  </div>
);
""")

write_file("components/orders/OrderManagement.tsx", """
import React from 'react';
import { Button } from '../common/Button/Button';

export const OrderManagement: React.FC = () => (
  <div style={{ backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
    <h3>Admin Actions</h3>
    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
      <Button variant="danger">Force Cancel</Button>
      <Button variant="outline">Process Refund</Button>
      <Button variant="ghost">Escalate to Support</Button>
    </div>
  </div>
);
""")

# Disputes
write_file("components/disputes/DisputeList.tsx", """
import React from 'react';
import { Table } from '../common/Table/Table';
import { Badge } from '../common/Badge/Badge';
import { Button } from '../common/Button/Button';

export const DisputeList: React.FC = () => {
  const data = [
    { id: 'D-0045', type: 'Item Not Received', buyer: 'John Kizza', seller: 'Kampala Organics', amount: 'UGX 30,000', status: 'open', date: '2023-12-05' }
  ];
  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'type', label: 'Type' },
    { key: 'buyer', label: 'Buyer' },
    { key: 'seller', label: 'Seller' },
    { key: 'amount', label: 'Amount' },
    { key: 'status', label: 'Status', render: (d: any) => <Badge variant={d.status}>{d.status}</Badge> },
    { key: 'date', label: 'Date' },
    { key: 'actions', label: 'Actions', render: () => <Button size="sm" variant="outline">Assign / View</Button> }
  ];
  return <Table columns={cols} data={data} />;
};
""")

write_file("components/disputes/DisputeDetails.tsx", """
import React from 'react';

export const DisputeDetails: React.FC = () => (
  <div style={{ backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
    <h2>Dispute #D-0045</h2>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
      <div style={{ padding: 'var(--space-3)', backgroundColor: '#fff3cd', borderRadius: 'var(--radius-sm)' }}>
        <strong>Buyer:</strong> John Kizza<br/>
        <em>"I never received the item despite it being marked as delivered."</em>
      </div>
      <div style={{ padding: 'var(--space-3)', backgroundColor: '#d4edda', borderRadius: 'var(--radius-sm)' }}>
        <strong>Seller:</strong> Kampala Organics<br/>
        <em>"We shipped via boda-boda and have the delivery receipt."</em>
      </div>
    </div>
  </div>
);
""")

write_file("components/disputes/DisputeResolution.tsx", """
import React from 'react';
import { Button } from '../common/Button/Button';

export const DisputeResolution: React.FC = () => (
  <div style={{ backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginTop: 'var(--space-4)' }}>
    <h3>Resolution Form</h3>
    <select style={{ width: '100%', padding: '8px', marginBottom: 'var(--space-3)' }}>
      <option>Refund buyer in full</option>
      <option>Partial refund</option>
      <option>Award seller</option>
      <option>Close no action</option>
    </select>
    <textarea placeholder="Resolution notes..." style={{ width: '100%', height: '80px', marginBottom: 'var(--space-3)', padding: '8px' }} />
    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
      <Button variant="primary">Close Dispute</Button>
      <Button variant="outline">Mark as Investigating</Button>
    </div>
  </div>
);
""")

# Categories
write_file("components/categories/CategoryList.tsx", """
import React from 'react';
import { Table } from '../common/Table/Table';
import { Button } from '../common/Button/Button';

export const CategoryList: React.FC = () => {
  const data = [
    { name: 'Electronics', count: 120 },
    { name: 'Fashion', count: 450 },
    { name: 'Food & Grocery', count: 80 }
  ];
  const cols = [
    { key: 'name', label: 'Name' },
    { key: 'count', label: 'Products' },
    { key: 'actions', label: 'Actions', render: () => (
      <div style={{display:'flex',gap:'8px'}}>
        <Button size="sm" variant="outline">Edit</Button>
        <Button size="sm" variant="danger">Delete</Button>
      </div>
    )}
  ];
  return <Table columns={cols} data={data} />;
};
""")

write_file("components/categories/CategoryForm.tsx", """
import React from 'react';
import { Input } from '../common/Input/Input';
import { Button } from '../common/Button/Button';

export const CategoryForm: React.FC = () => (
  <div style={{ backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
    <h3>Create/Edit Category</h3>
    <Input label="Name" required placeholder="e.g. Electronics" />
    <Input label="Slug" placeholder="e.g. electronics" />
    <Input label="Sort Order" type="number" />
    <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
      <Button variant="primary">Save</Button>
      <Button variant="ghost">Cancel</Button>
    </div>
  </div>
);
""")

write_file("components/categories/CategoryHierarchy.tsx", """
import React from 'react';

export const CategoryHierarchy: React.FC = () => (
  <div style={{ backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
    <h3>Hierarchy</h3>
    <ul style={{ listStyle: 'none', padding: 0 }}>
      <li style={{ padding: '8px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)' }}>Electronics</li>
      <li style={{ padding: '8px', paddingLeft: '24px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)' }}>Mobile Phones</li>
      <li style={{ padding: '8px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)' }}>Fashion</li>
    </ul>
  </div>
);
""")

# Analytics
write_file("components/analytics/PlatformAnalytics.tsx", """
import React from 'react';
import { GMVChart } from '../dashboard/GMVChart';

export const PlatformAnalytics: React.FC = () => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
    <GMVChart />
    <div style={{ backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>Order Volume Chart (Mock)</div>
    <div style={{ backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>User Growth Chart (Mock)</div>
  </div>
);
""")

write_file("components/analytics/RevenueAnalytics.tsx", """
import React from 'react';
import { StatCard } from '../common/StatCard';

export const RevenueAnalytics: React.FC = () => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
    <StatCard label="Platform Commission Earned" value="UGX 28.4M" icon="💰" colorVariant="#00b894" />
    <StatCard label="Total Payouts" value="UGX 255.6M" icon="💸" colorVariant="#e94560" />
    <StatCard label="Net Revenue" value="UGX 28.4M" icon="📈" colorVariant="#0984e3" />
  </div>
);
""")

write_file("components/analytics/SellerAnalytics.tsx", """
import React from 'react';
import { Table } from '../common/Table/Table';

export const SellerAnalytics: React.FC = () => {
  const data = [
    { name: 'Kampala Organics', gmv: 'UGX 4.5M', orders: 150, rating: 4.8 }
  ];
  const cols = [
    { key: 'name', label: 'Store Name' },
    { key: 'gmv', label: 'GMV' },
    { key: 'orders', label: 'Orders' },
    { key: 'rating', label: 'Rating' }
  ];
  return (
    <div style={{ backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
      <h3>Top 5 Sellers</h3>
      <Table columns={cols} data={data} />
    </div>
  );
};
""")

write_file("components/analytics/ReportsExport.tsx", """
import React from 'react';
import { Button } from '../common/Button/Button';

export const ReportsExport: React.FC = () => {
  const download = () => alert("Download started (Mock)");
  return (
    <div style={{ display: 'flex', gap: 'var(--space-4)', padding: 'var(--space-4)', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
      <Button variant="outline" onClick={download}>Download Orders CSV</Button>
      <Button variant="outline" onClick={download}>Download Revenue Report</Button>
      <Button variant="outline" onClick={download}>Download User List</Button>
    </div>
  );
};
""")

# Settings
write_file("components/settings/PlatformSettings.tsx", """
import React from 'react';
import { Input } from '../common/Input/Input';
import { Button } from '../common/Button/Button';

export const PlatformSettings: React.FC = () => (
  <div style={{ maxWidth: '600px', backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
    <h3>Platform Settings</h3>
    <Input label="Platform Name" value="MUNI" />
    <Input label="Support Email" value="support@muni.ug" />
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-4)' }}>
      <input type="checkbox" /> <span style={{ color: 'var(--color-danger)' }}>Maintenance Mode (Dangerous)</span>
    </div>
    <Button variant="primary">Save Changes</Button>
  </div>
);
""")

write_file("components/settings/PaymentSettings.tsx", """
import React from 'react';
import { Input } from '../common/Input/Input';
import { Button } from '../common/Button/Button';

export const PaymentSettings: React.FC = () => (
  <div style={{ maxWidth: '600px', backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
    <h3>Payment Settings</h3>
    <Input label="Commission rate %" value="5" type="number" />
    <Input label="MTN MoMo merchant code" value="MUNI123" />
    <Input label="Airtel Money merchant code" value="MUNI456" />
    <Input label="Payment processing delay (hours)" value="24" type="number" />
    <Button variant="primary">Save Changes</Button>
  </div>
);
""")

write_file("components/settings/ShippingSettings.tsx", """
import React from 'react';
import { Table } from '../common/Table/Table';

export const ShippingSettings: React.FC = () => {
  const data = [
    { district: 'Kampala', rate: 'UGX 5,000' },
    { district: 'Wakiso', rate: 'UGX 8,000' },
    { district: 'Jinja', rate: 'UGX 15,000' }
  ];
  const cols = [
    { key: 'district', label: 'District' },
    { key: 'rate', label: 'Default Rate' }
  ];
  return (
    <div style={{ maxWidth: '800px', backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
      <h3>Shipping Defaults</h3>
      <Table columns={cols} data={data} />
    </div>
  );
};
""")

# Pages
write_file("pages/DashboardPage.tsx", """
import React from 'react';
import { PlatformStats } from '../components/dashboard/PlatformStats';
import { GMVChart } from '../components/dashboard/GMVChart';
import { RecentActivity } from '../components/dashboard/RecentActivity';
import { QuickActions } from '../components/dashboard/QuickActions';

export const DashboardPage: React.FC = () => {
  return (
    <div style={{ padding: 'var(--space-4)' }}>
      <h1 style={{ marginBottom: 'var(--space-6)' }}>Dashboard</h1>
      <PlatformStats />
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <GMVChart />
          <RecentActivity />
        </div>
        <div>
          <QuickActions />
        </div>
      </div>
    </div>
  );
};
""")

write_file("pages/UsersPage.tsx", """
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
""")

write_file("pages/UserDetailsPage.tsx", """
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { UserDetails } from '../components/users/UserDetails';
import { Button } from '../components/common/Button/Button';

export const UserDetailsPage: React.FC = () => {
  const { id } = useParams();
  const nav = useNavigate();
  return (
    <div style={{ padding: 'var(--space-4)' }}>
      <Button variant="ghost" onClick={() => nav(-1)}>← Back</Button>
      <h1 style={{ marginTop: 'var(--space-4)' }}>User Details</h1>
      <UserDetails userId={id} />
    </div>
  );
};
""")

write_file("pages/ProductsPage.tsx", """
import React from 'react';
import { SearchBar } from '../components/common/SearchBar';
import { ProductList } from '../components/products/ProductList';

export const ProductsPage: React.FC = () => (
  <div style={{ padding: 'var(--space-4)' }}>
    <h1>Products</h1>
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <SearchBar onSearch={() => {}} placeholder="Search products..." />
    </div>
    <ProductList />
  </div>
);
""")

write_file("pages/ProductModerationPage.tsx", """
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProductDetails } from '../components/products/ProductDetails';
import { ProductModeration } from '../components/products/ProductModeration';
import { Button } from '../components/common/Button/Button';

export const ProductModerationPage: React.FC = () => {
  const { id } = useParams();
  const nav = useNavigate();
  return (
    <div style={{ padding: 'var(--space-4)' }}>
      <Button variant="ghost" onClick={() => nav(-1)}>← Back to Products</Button>
      <h1 style={{ marginTop: 'var(--space-4)' }}>Moderate Product</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-4)' }}>
        <ProductDetails />
        <ProductModeration />
      </div>
    </div>
  );
};
""")

write_file("pages/OrdersPage.tsx", """
import React from 'react';
import { OrderList } from '../components/orders/OrderList';
import { SearchBar } from '../components/common/SearchBar';

export const OrdersPage: React.FC = () => (
  <div style={{ padding: 'var(--space-4)' }}>
    <h1>All Orders</h1>
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <SearchBar onSearch={() => {}} placeholder="Search orders..." />
    </div>
    <OrderList />
  </div>
);
""")

write_file("pages/DisputesPage.tsx", """
import React from 'react';
import { DisputeList } from '../components/disputes/DisputeList';

export const DisputesPage: React.FC = () => (
  <div style={{ padding: 'var(--space-4)' }}>
    <h1>Disputes</h1>
    <DisputeList />
  </div>
);
""")

write_file("pages/CategoriesPage.tsx", """
import React from 'react';
import { CategoryHierarchy } from '../components/categories/CategoryHierarchy';
import { CategoryForm } from '../components/categories/CategoryForm';
import { CategoryList } from '../components/categories/CategoryList';

export const CategoriesPage: React.FC = () => (
  <div style={{ padding: 'var(--space-4)' }}>
    <h1>Category Management</h1>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
      <CategoryHierarchy />
      <CategoryForm />
    </div>
    <CategoryList />
  </div>
);
""")

write_file("pages/AnalyticsPage.tsx", """
import React from 'react';
import { PlatformAnalytics } from '../components/analytics/PlatformAnalytics';
import { RevenueAnalytics } from '../components/analytics/RevenueAnalytics';
import { SellerAnalytics } from '../components/analytics/SellerAnalytics';
import { ReportsExport } from '../components/analytics/ReportsExport';

export const AnalyticsPage: React.FC = () => (
  <div style={{ padding: 'var(--space-4)' }}>
    <h1>Analytics</h1>
    <PlatformAnalytics />
    <RevenueAnalytics />
    <SellerAnalytics />
    <div style={{ marginTop: 'var(--space-4)' }}>
      <ReportsExport />
    </div>
  </div>
);
""")

write_file("pages/SettingsPage.tsx", """
import React from 'react';
import { PlatformSettings } from '../components/settings/PlatformSettings';
import { PaymentSettings } from '../components/settings/PaymentSettings';
import { ShippingSettings } from '../components/settings/ShippingSettings';

export const SettingsPage: React.FC = () => (
  <div style={{ padding: 'var(--space-4)' }}>
    <h1>Settings</h1>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <PlatformSettings />
      <PaymentSettings />
      <ShippingSettings />
    </div>
  </div>
);
""")

write_file("router/index.tsx", """
import { Routes, Route, Navigate } from 'react-router-dom';
import { ROUTES } from './routes';
import { PrivateRoute } from './PrivateRoute';
import { AdminLayout } from '../components/layout/AdminLayout';

import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { UsersPage } from '../pages/UsersPage';
import { UserDetailsPage } from '../pages/UserDetailsPage';
import { ProductsPage } from '../pages/ProductsPage';
import { ProductModerationPage } from '../pages/ProductModerationPage';
import { OrdersPage } from '../pages/OrdersPage';
import { DisputesPage } from '../pages/DisputesPage';
import { CategoriesPage } from '../pages/CategoriesPage';
import { AnalyticsPage } from '../pages/AnalyticsPage';
import { SettingsPage } from '../pages/SettingsPage';

export function Router() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route element={<PrivateRoute />}>
        <Route element={<AdminLayout />}>
          <Route path={ROUTES.DASHBOARD} element={<DashboardPage />} />
          <Route path={ROUTES.USERS} element={<UsersPage />} />
          <Route path={ROUTES.USER_DETAILS} element={<UserDetailsPage />} />
          <Route path={ROUTES.PRODUCTS} element={<ProductsPage />} />
          <Route path={ROUTES.PRODUCT_MODERATION} element={<ProductModerationPage />} />
          <Route path={ROUTES.ORDERS} element={<OrdersPage />} />
          <Route path={ROUTES.DISPUTES} element={<DisputesPage />} />
          <Route path={ROUTES.CATEGORIES} element={<CategoriesPage />} />
          <Route path={ROUTES.ANALYTICS} element={<AnalyticsPage />} />
          <Route path={ROUTES.SETTINGS} element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
""")
