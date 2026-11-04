export const formatMoney = (amount: number): string => {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    minimumFractionDigits: 0
  }).format(amount);
};

export const formatDate = (date: string | Date): string => {
  return new Date(date).toLocaleDateString('en-UG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

export const formatDateTime = (date: string | Date): string => {
  return new Date(date).toLocaleString('en-UG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const orderStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    PENDING: 'Pending',
    PROCESSING: 'Processing',
    SHIPPED: 'Shipped',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled'
  };
  return labels[status] || status;
};
