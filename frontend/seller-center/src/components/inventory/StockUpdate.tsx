import React, { useState } from 'react';
import { Modal } from '../common/Modal/Modal';

interface StockUpdateProps {
  isOpen: boolean;
  onClose: () => void;
  product: { id: string; name: string; stock: number } | null;
  onSave: (id: string, quantity: number) => void;
}

export const StockUpdate: React.FC<StockUpdateProps> = ({ isOpen, onClose, product, onSave }) => {
  const [type, setType] = useState('add');
  const [amount, setAmount] = useState('');

  if (!product) return null;

  const handleSave = () => {
    let finalQty = product.stock;
    const numAmount = parseInt(amount, 10) || 0;
    
    if (type === 'add') finalQty += numAmount;
    else if (type === 'subtract') finalQty -= numAmount;
    else if (type === 'set') finalQty = numAmount;

    onSave(product.id, finalQty);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Update Stock">
      <p style={{ margin: '0 0 16px 0' }}>Updating stock for: <strong>{product.name}</strong></p>
      <p style={{ margin: '0 0 16px 0' }}>Current Stock: {product.stock}</p>

      <label style={{ display: 'block', marginBottom: '8px' }}>Adjustment Type</label>
      <select 
        value={type} 
        onChange={(e) => setType(e.target.value)} 
        style={{ width: '100%', padding: '10px', marginBottom: '16px', border: '1px solid #ccc', borderRadius: '4px' }}
      >
        <option value="add">Add (+)</option>
        <option value="subtract">Subtract (-)</option>
        <option value="set">Set exactly</option>
      </select>

      <label style={{ display: 'block', marginBottom: '8px' }}>Amount</label>
      <input 
        type="number" 
        value={amount} 
        onChange={(e) => setAmount(e.target.value)} 
        style={{ width: '100%', padding: '10px', marginBottom: '24px', border: '1px solid #ccc', borderRadius: '4px' }}
      />

      <button 
        onClick={handleSave}
        style={{ width: '100%', padding: '12px', backgroundColor: '#0066cc', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
      >
        Save Stock
      </button>
    </Modal>
  );
};
