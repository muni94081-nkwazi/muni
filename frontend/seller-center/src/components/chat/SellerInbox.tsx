import React, { useState } from 'react';

interface ConversationItem {
  id: string;
  buyerName: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCountSeller: number;
}

export const SellerInbox: React.FC = () => {
  const [conversations] = useState<ConversationItem[]>([
    {
      id: 'conv-seed-1',
      buyerName: 'MUNI Customer (user-123)',
      lastMessage: 'Is this Samsung Galaxy S24 still available for delivery to Entebbe?',
      lastMessageAt: '10 min ago',
      unreadCountSeller: 1,
    },
  ]);

  const [activeConvId, setActiveConvId] = useState('conv-seed-1');
  const [replyText, setReplyText] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { sender: 'buyer', text: 'Is this Samsung Galaxy S24 still available for delivery to Entebbe?' },
  ]);

  const quickReplies = [
    'Yes, this item is available for immediate dispatch!',
    'Delivery to Entebbe takes 24 hours via speed courier.',
    'Thank you for your order! We are packing your item now.',
  ];

  const handleSendReply = (text?: string) => {
    const content = text || replyText;
    if (!content.trim()) return;

    setChatHistory((prev) => [...prev, { sender: 'seller', text: content }]);
    if (!text) setReplyText('');
  };

  return (
    <div style={{ display: 'flex', height: 500, border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden', fontFamily: 'system-ui' }}>
      {/* Left Conversation List */}
      <div style={{ width: 260, borderRight: '1px solid #e2e8f0', background: '#f8fafc' }}>
        <div style={{ padding: 12, fontWeight: 700, borderBottom: '1px solid #e2e8f0', background: '#f1f5f9' }}>
          💬 Buyer Messages ({conversations.length})
        </div>
        {conversations.map((c) => (
          <div
            key={c.id}
            onClick={() => setActiveConvId(c.id)}
            style={{
              padding: 12,
              borderBottom: '1px solid #e2e8f0',
              cursor: 'pointer',
              background: activeConvId === c.id ? '#ffffff' : 'transparent',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
              <span>{c.buyerName}</span>
              {c.unreadCountSeller > 0 && (
                <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 10 }}>NEW</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {c.lastMessage}
            </div>
          </div>
        ))}
      </div>

      {/* Right Chat Window */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#ffffff' }}>
        <div style={{ padding: 12, borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: 14 }}>
          Conversation with MUNI Customer
        </div>

        <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {chatHistory.map((m, idx) => (
            <div
              key={idx}
              style={{
                alignSelf: m.sender === 'seller' ? 'flex-end' : 'flex-start',
                backgroundColor: m.sender === 'seller' ? '#0284c7' : '#f1f5f9',
                color: m.sender === 'seller' ? '#ffffff' : '#1e293b',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 13,
                maxWidth: '75%',
              }}
            >
              {m.text}
            </div>
          ))}
        </div>

        {/* Quick Reply Templates */}
        <div style={{ padding: '6px 12px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Quick Replies:</span>
          {quickReplies.map((qr, idx) => (
            <button
              key={idx}
              onClick={() => handleSendReply(qr)}
              style={{ fontSize: 11, background: '#e2e8f0', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}
            >
              {qr}
            </button>
          ))}
        </div>

        {/* Reply Input */}
        <div style={{ padding: 12, borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
            placeholder="Type your reply to buyer..."
            style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
          />
          <button
            onClick={() => handleSendReply()}
            style={{ backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, padding: '0 16px', fontWeight: 600, cursor: 'pointer' }}
          >
            Reply
          </button>
        </div>
      </div>
    </div>
  );
};
