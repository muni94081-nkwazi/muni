import { useState } from 'react';

interface SellerMessage {
  id: string;
  sender: 'buyer' | 'seller';
  senderName: string;
  text: string;
  timestamp: string;
}

interface BuyerThread {
  id: string;
  buyerName: string;
  productName: string;
  lastMsg: string;
  unread: boolean;
}

export function SellerMessagesPage() {
  const [threads] = useState<BuyerThread[]>([
    {
      id: 'th-1',
      buyerName: 'Alex K.',
      productName: '55" Smart TV',
      lastMsg: 'Yes, we include a 2-year official manufacturer warranty!',
      unread: true,
    },
    {
      id: 'th-2',
      buyerName: 'Sarah M.',
      productName: 'Bluetooth Earbuds',
      lastMsg: 'Can you ship via express courier to Entebbe?',
      unread: false,
    },
  ]);

  const [activeThreadId, setActiveThreadId] = useState('th-1');

  const [messages, setMessages] = useState<Record<string, SellerMessage[]>>({
    'th-1': [
      { id: 'sm-1', sender: 'buyer', senderName: 'Alex K.', text: 'Hello! Does this TV come with a wall mount bracket included?', timestamp: '10:14 AM' },
      { id: 'sm-2', sender: 'seller', senderName: 'Me (Kampala Tech)', text: 'Hi! Yes, standard VESA wall mount is included in the box.', timestamp: '10:16 AM' },
      { id: 'sm-3', sender: 'seller', senderName: 'Me (Kampala Tech)', text: 'Yes, we include a 2-year official manufacturer warranty!', timestamp: '10:17 AM' },
    ],
    'th-2': [
      { id: 'sm-4', sender: 'buyer', senderName: 'Sarah M.', text: 'Can you ship via express courier to Entebbe?', timestamp: '09:00 AM' },
    ],
  });

  const [replyText, setReplyText] = useState('');

  const activeThread = threads.find((t) => t.id === activeThreadId);

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    const newMsg: SellerMessage = {
      id: `sm-${Date.now()}`,
      sender: 'seller',
      senderName: 'Me (Kampala Tech)',
      text: replyText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => ({
      ...prev,
      [activeThreadId]: [...(prev[activeThreadId] || []), newMsg],
    }));

    setReplyText('');
  };

  return (
    <div style={{ padding: 'var(--space-6)' }}>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Buyer Messages & Inquiries</h1>
        <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '2px' }}>
          Customer pre-sale questions and order support
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '320px 1fr',
          height: 580,
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
        }}
      >
        {/* Left Thread List */}
        <div style={{ borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: '14px', background: '#f8fafc' }}>
            Customer Conversations
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {threads.map((t) => (
              <div
                key={t.id}
                onClick={() => setActiveThreadId(t.id)}
                style={{
                  padding: '16px',
                  borderBottom: '1px solid #e2e8f0',
                  background: activeThreadId === t.id ? '#edf2f7' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{t.buyerName}</span>
                  {t.unread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563eb' }} />}
                </div>
                <p style={{ fontSize: '12px', fontWeight: 600, color: '#2563eb', marginBottom: '4px' }}>{t.productName}</p>
                <p style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.lastMsg}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Right Chat View */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {activeThread && (
            <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 800 }}>Conversation with {activeThread.buyerName}</h3>
              <p style={{ fontSize: '12px', color: '#64748b' }}>Item: {activeThread.productName}</p>
            </div>
          )}

          <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {(messages[activeThreadId] || []).map((m) => (
              <div
                key={m.id}
                style={{
                  alignSelf: m.sender === 'seller' ? 'flex-end' : 'flex-start',
                  maxWidth: '70%',
                  background: m.sender === 'seller' ? '#2563eb' : '#f1f5f9',
                  color: m.sender === 'seller' ? '#ffffff' : '#0f172a',
                  padding: '10px 14px',
                  borderRadius: m.sender === 'seller' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  fontSize: '13px',
                }}
              >
                <div style={{ fontSize: '10px', opacity: 0.8, marginBottom: '2px', fontWeight: 600 }}>{m.senderName}</div>
                <div>{m.text}</div>
                <div style={{ fontSize: '9px', opacity: 0.7, textAlign: 'right', marginTop: '4px' }}>{m.timestamp}</div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSendReply} style={{ padding: '16px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Type your response..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              style={{ flex: 1, padding: '10px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
            />
            <button
              type="submit"
              style={{
                padding: '10px 20px',
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
export default SellerMessagesPage;
