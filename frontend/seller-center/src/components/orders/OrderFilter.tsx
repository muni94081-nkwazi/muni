import React from 'react';
import type { SubOrderStatus } from '../../types/order.types';
const STATUS_LABELS: Record<SubOrderStatus, string> = {
  pending:           'Order Placed',
  payment_confirmed: 'Payment Confirmed',
  processing:        'Preparing Items',
  picked_up:         'Picked Up by Carrier',
  in_transit:        'In Transit',
  out_for_delivery:  'Out for Delivery',
  delivered:         'Delivered',
  cancelled:         'Cancelled',
  refunded:          'Refunded',
};

/** What this filter emits. An empty status means "all". */
export interface OrderFilters {
  status?: SubOrderStatus | '';
}

export const OrderFilter: React.FC<{ onChange: (filters: OrderFilters) => void }> = ({ onChange }) => {
  return (
    <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', backgroundColor: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
      <input 
        type="text" 
        placeholder="Search by Order #"
        style={{ flex: 1, padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}
      />
      <select 
        style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}
        // Every option below is either '' or a member of the union, so the
        // assertion states what the markup already guarantees.
        onChange={(e) => onChange({ status: e.target.value as SubOrderStatus | '' })}
      >
        <option value="">All Statuses</option>
        {(Object.keys(STATUS_LABELS) as SubOrderStatus[]).map((status) => (
          <option key={status} value={status}>{STATUS_LABELS[status]}</option>
        ))}
      </select>
      <input type="date" style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }} />
      <input type="date" style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }} />
    </div>
  );
};
