import { useState } from 'react';
import { Table } from '../components/common/Table/Table';
import { Badge } from '../components/common/Badge/Badge';

const DISPUTES = [
  { id: 'd1', orderId: 'MUNI-000010', buyer: 'Apio Grace', seller: 'Kamya Store', reason: 'Item not received', amount: 130000, status: 'open', date: '2025-07-20' },
  { id: 'd2', orderId: 'MUNI-000008', buyer: 'Otieno David', seller: 'Nakato Fashions', reason: 'Item not as described', amount: 45000, status: 'under_review', date: '2025-07-18' },
  { id: 'd3', orderId: 'MUNI-000005', buyer: 'Namukasa Fiona', seller: 'Ssebunya Electronics', reason: 'Defective product', amount: 85000, status: 'resolved', date: '2025-07-15' },
  { id: 'd4', orderId: 'MUNI-000003', buyer: 'Mukasa Robert', seller: 'Kiggundu Foods', reason: 'Wrong item delivered', amount: 28000, status: 'closed', date: '2025-07-12' },
];

type DisputeRow = (typeof DISPUTES)[number];

export function DisputesPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [disputes, setDisputes] = useState(DISPUTES);
  const dispute = disputes.find((d) => d.id === selected);

  function handleResolve(disputeId: string, resolution: 'buyer' | 'seller') {
    setDisputes((prev) => prev.map((d) => d.id === disputeId ? { ...d, status: 'resolved' } : d));
    setSelected(null);
    setNotes('');
    alert(`Dispute resolved in favor of ${resolution}`);
  }

  const columns = [
    { key: 'orderId', label: 'Order' },
    { key: 'date', label: 'Date' },
    { key: 'buyer', label: 'Buyer' },
    { key: 'seller', label: 'Seller' },
    { key: 'reason', label: 'Reason' },
    {
      key: 'amount', label: 'Amount (UGX)',
      render: (d: DisputeRow) => d.amount.toLocaleString(),
      sortAccessor: (d: DisputeRow) => d.amount,
    },
    {
      key: 'status', label: 'Status',
      render: (d: DisputeRow) => <Badge variant={d.status}>{d.status.replace('_', ' ')}</Badge>,
    },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>Dispute Management</h1>
      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: 20 }}>
        <Table
          columns={columns}
          data={disputes}
          searchable
          searchPlaceholder="Search disputes by order, buyer, seller, reason…"
          sortable
          pageSize={10}
          getRowId={(d: DisputeRow) => d.id}
          onRowClick={(d: DisputeRow) => setSelected(d.id === selected ? null : d.id)}
        />

        {dispute && (
          <div style={{ background: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-border)', padding: 20, alignSelf: 'start' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontWeight: 700, fontSize: 16 }}>Dispute Detail</h3>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
            {[['Order', dispute.orderId], ['Buyer', dispute.buyer], ['Seller', dispute.seller], ['Reason', dispute.reason], ['Amount', `UGX ${dispute.amount.toLocaleString()}`], ['Status', dispute.status.replace('_', ' ')]].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 700, minWidth: 70, color: 'var(--color-text-secondary)' }}>{k}:</span>
                <span>{v}</span>
              </div>
            ))}
            <hr style={{ margin: '16px 0', borderColor: 'var(--color-border)' }} />
            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Resolution Notes</p>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Enter resolution notes..."
              style={{ width: '100%', padding: 8, border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => handleResolve(dispute.id, 'buyer')}
                style={{ flex: 1, background: 'var(--color-success)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 0', fontWeight: 600, cursor: 'pointer', fontSize: 12 }}>
                Resolve → Buyer
              </button>
              <button onClick={() => handleResolve(dispute.id, 'seller')}
                style={{ flex: 1, background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 0', fontWeight: 600, cursor: 'pointer', fontSize: 12 }}>
                Resolve → Seller
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
