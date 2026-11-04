import React, { useState } from 'react';

interface ShareButtonProps {
  wishlistId: string;
  wishlistName?: string;
}

export const ShareButton: React.FC<ShareButtonProps> = ({ wishlistId, wishlistName = 'My Wishlist' }) => {
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = `https://muni.ug/wishlist/shared/share-token-${wishlistId}`;
    setShareUrl(url);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ margin: '10px 0' }}>
      {!shareUrl ? (
        <button
          onClick={handleShare}
          style={{
            backgroundColor: '#0284c7',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          🔗 Share Wishlist
        </button>
      ) : (
        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Share "{wishlistName}" with friends:</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              readOnly
              value={shareUrl}
              style={{ flex: 1, padding: 6, borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}
            />
            <button
              onClick={copyToClipboard}
              style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Check out my MUNI wishlist "${wishlistName}": ${shareUrl}`)}`}
              target="_blank"
              rel="noreferrer"
              style={{ backgroundColor: '#25D366', color: '#fff', padding: '4px 10px', borderRadius: 4, textDecoration: 'none', fontSize: 12, fontWeight: 600 }}
            >
              WhatsApp
            </a>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
              target="_blank"
              rel="noreferrer"
              style={{ backgroundColor: '#1877F2', color: '#fff', padding: '4px 10px', borderRadius: 4, textDecoration: 'none', fontSize: 12, fontWeight: 600 }}
            >
              Facebook
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
