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
