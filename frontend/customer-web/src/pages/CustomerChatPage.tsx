import { useState } from 'react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'seller' | 'assistant';
  senderName: string;
  text: string;
  timestamp: string;
}

interface Conversation {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerBadge: string;
  productName: string;
  lastMessage: string;
  unreadCount: number;
}

export function CustomerChatPage() {
  const [conversations] = useState<Conversation[]>([
    {
      id: 'conv-1',
      sellerId: 'sel-901',
      sellerName: 'Kampala Tech Official Store',
      sellerBadge: 'Gold Supplier',
      productName: '4K OLED Smart TV 55"',
      lastMessage: 'Yes, we include a 2-year official manufacturer warranty!',
      unreadCount: 1,
    },
    {
      id: 'conv-2',
      sellerId: 'sel-902',
      sellerName: 'Nile Electronics Direct',
      sellerBadge: 'Verified Seller',
      productName: 'Wireless Noise Cancelling Headphones',
      lastMessage: 'Your order was dispatched this morning via MUNI Express.',
      unreadCount: 0,
    },
  ]);

  const [activeConvId, setActiveConvId] = useState('conv-1');

  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({
    'conv-1': [
      { id: 'm-1', sender: 'user', senderName: 'Me', text: 'Hello! Does this TV come with a wall mount bracket included?', timestamp: '10:14 AM' },
      { id: 'm-2', sender: 'seller', senderName: 'Kampala Tech', text: 'Hi! Yes, standard VESA wall mount is included in the box.', timestamp: '10:16 AM' },
      { id: 'm-3', sender: 'seller', senderName: 'Kampala Tech', text: 'Yes, we include a 2-year official manufacturer warranty!', timestamp: '10:17 AM' },
    ],
    'conv-2': [
      { id: 'm-4', sender: 'user', senderName: 'Me', text: 'Hi, when will my headphones be delivered?', timestamp: '09:00 AM' },
      { id: 'm-5', sender: 'seller', senderName: 'Nile Electronics', text: 'Your order was dispatched this morning via MUNI Express.', timestamp: '09:15 AM' },
    ],
  });

  const [inputText, setInputText] = useState('');

  const activeConv = conversations.find((c) => c.id === activeConvId);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const newMsg: ChatMessage = {
      id: `m-${Date.now()}`,
      sender: 'user',
      senderName: 'Me',
      text: inputText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => ({
      ...prev,
      [activeConvId]: [...(prev[activeConvId] || []), newMsg],
    }));

    setInputText('');

    // Simulated instant reply from seller bot
    setTimeout(() => {
      const autoReply: ChatMessage = {
        id: `m-bot-${Date.now()}`,
        sender: 'seller',
        senderName: activeConv?.sellerName || 'Seller',
        text: 'Thank you for your message! Our customer agent is reviewing your query.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => ({
        ...prev,
        [activeConvId]: [...(prev[activeConvId] || []), autoReply],
      }));
    }, 1200);
  };

  return (
    <div style={{ paddingBottom: 'var(--space-8)' }}>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 800 }}>Buyer-Seller Messages</h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
          Direct instant messaging with sellers and MUNI support
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '300px 1fr',
          height: 600,
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
          overflow: 'hidden',
        }}
      >
        {/* Left Sidebar Conversations List */}
        <div style={{ borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', fontWeight: 700, fontSize: 'var(--text-sm)' }}>
            Active Conversations
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                style={{
                  padding: 'var(--space-4)',
                  borderBottom: '1px solid var(--color-border)',
                  background: activeConvId === conv.id ? '#f1f5f9' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{conv.sellerName}</span>
                  <span style={{ fontSize: '10px', background: '#dbeafe', color: '#1e40af', padding: '2px 6px', borderRadius: '8px', fontWeight: 600 }}>
                    {conv.sellerBadge}
                  </span>
                </div>
                <p style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-primary)', marginBottom: '4px' }}>{conv.productName}</p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {conv.lastMessage}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Right Chat Conversation View */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header */}
          {activeConv && (
            <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 800 }}>{activeConv.sellerName}</h3>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  Inquiring about: <strong>{activeConv.productName}</strong>
                </p>
              </div>
              <span style={{ background: '#dcfce7', color: '#15803d', fontSize: 'var(--text-xs)', fontWeight: 700, padding: '4px 10px', borderRadius: '12px' }}>
                🟢 Seller Online
              </span>
            </div>
          )}

          {/* Messages Container */}
          <div style={{ flex: 1, padding: 'var(--space-4)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {(messages[activeConvId] || []).map((msg) => (
              <div
                key={msg.id}
                style={{
                  alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '70%',
                  background: msg.sender === 'user' ? 'var(--color-primary)' : '#f1f5f9',
                  color: msg.sender === 'user' ? '#fff' : 'var(--color-text-primary)',
                  padding: '10px 14px',
                  borderRadius: msg.sender === 'user' ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                  fontSize: 'var(--text-xs)',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontSize: '10px', opacity: 0.8, marginBottom: '2px', fontWeight: 600 }}>{msg.senderName}</div>
                <div>{msg.text}</div>
                <div style={{ fontSize: '9px', opacity: 0.7, textAlign: 'right', marginTop: '4px' }}>{msg.timestamp}</div>
              </div>
            ))}
          </div>

          {/* Input Form */}
          <form onSubmit={handleSendMessage} style={{ padding: 'var(--space-4)', borderTop: '1px solid var(--color-border)', display: 'flex', gap: 'var(--space-2)' }}>
            <input
              type="text"
              placeholder="Type your message to seller..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              style={{ flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: 'var(--text-xs)' }}
            />
            <button
              type="submit"
              style={{
                padding: '10px 20px',
                background: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontWeight: 700,
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
              }}
            >
              Send Message
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
