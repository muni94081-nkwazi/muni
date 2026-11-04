import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useChatSocket } from '@/hooks/useChatSocket';
import { chatApi } from '@/api/chat.api';
import { OfferCard } from './OfferCard';
import { CounterOfferBanner } from './CounterOfferBanner';
import { classNames } from '@/utils/helpers';
import styles from './ChatDrawer.module.css';

export interface ChatDrawerProps {
  sellerId: string;
  sellerStoreName: string;
  productId?: string;
  productPrice?: number;
  currency?: string;
}

/** Floating buyer-seller chat drawer with an embedded "Make an Offer" negotiation flow. */
export function ChatDrawer({ sellerId, sellerStoreName, productId, productPrice, currency = 'UGX' }: ChatDrawerProps) {
  const { user, isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [input, setInput] = useState('');
  const [badgeCount, setBadgeCount] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!isAuthenticated) return;
    chatApi
      .getConversations()
      .then((convs) => {
        const match = convs.find((c) => c.sellerId === sellerId && c.productId === productId);
        if (match) setBadgeCount(match.unreadCountBuyer);
      })
      .catch(() => {});
  }, [isAuthenticated, sellerId, productId]);

  const join = useMemo(
    () => ({ buyerId: user?.id, buyerName: user?.fullName, sellerId, sellerStoreName, productId }),
    [user?.id, user?.fullName, sellerId, sellerStoreName, productId],
  );

  const { conversation, messages, offers, isConnected, isPeerTyping, error, sendMessage, setTyping, markRead, makeOffer, respondToOffer } =
    useChatSocket({ userId: user?.id ?? '', join, enabled: isOpen && isAuthenticated && Boolean(user) });

  useEffect(() => {
    if (isOpen && conversation) markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, conversation?.id, messages.length]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const myOffersCount = useMemo(
    () => offers.filter((o) => o.proposedBy === 'buyer' && !o.parentOfferId).length,
    [offers],
  );

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input, 'buyer');
    setInput('');
    setTyping(false);
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    setTyping(true);
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setTyping(false), 1500);
  };

  const handleClose = () => {
    setIsOpen(false);
    setBadgeCount(0);
  };

  if (!isAuthenticated) return null;

  const displayUnread = isOpen ? 0 : badgeCount;

  return (
    <div className={styles.wrapper}>
      {!isOpen ? (
        <button className={styles.launcher} onClick={() => setIsOpen(true)}>
          💬 Chat with Seller
          {displayUnread > 0 && <span className={styles.badge}>{displayUnread}</span>}
        </button>
      ) : (
        <div className={styles.drawer}>
          <div className={styles.header}>
            <div>
              <div className={styles.sellerName}>{sellerStoreName}</div>
              <div className={styles.status}>{isConnected ? '🟢 Online' : '⚪ Connecting…'}</div>
            </div>
            <button className={styles.closeBtn} onClick={handleClose} aria-label="Close chat">
              ✕
            </button>
          </div>

          <div className={styles.messages} ref={listRef}>
            {messages.map((msg) => {
              if (msg.messageType === 'offer' && msg.offerId) {
                const offer = offers.find((o) => o.id === msg.offerId);
                if (!offer) return null;
                return (
                  <CounterOfferBanner
                    key={msg.id}
                    offer={offer}
                    viewerRole="buyer"
                    onAccept={(id) => respondToOffer({ offerId: id, action: 'accept', actingRole: 'buyer' })}
                    onDecline={(id) => respondToOffer({ offerId: id, action: 'decline', actingRole: 'buyer' })}
                    onCounter={(id, price) =>
                      respondToOffer({ offerId: id, action: 'counter', actingRole: 'buyer', counterPrice: price })
                    }
                  />
                );
              }
              if (msg.messageType === 'system') {
                return (
                  <div key={msg.id} className={styles.systemBubble}>
                    {msg.content}
                  </div>
                );
              }
              const isMine = msg.senderRole === 'buyer';
              return (
                <div key={msg.id} className={classNames(styles.bubble, isMine ? styles.mine : styles.theirs)}>
                  {msg.content}
                </div>
              );
            })}
            {isPeerTyping && <div className={styles.typing}>Seller is typing…</div>}
          </div>

          {error && <div className={styles.errorBar}>{error}</div>}

          {productId && productPrice != null && (
            <div className={styles.offerZone}>
              {showOfferForm ? (
                <OfferCard
                  originalPrice={productPrice}
                  currency={currency}
                  offersUsed={myOffersCount}
                  disabled={!isConnected}
                  onSubmit={(offerPrice) => {
                    makeOffer({ productId, sellerId, originalPrice: productPrice, offerPrice, currency });
                    setShowOfferForm(false);
                  }}
                />
              ) : (
                <button className={styles.offerToggle} onClick={() => setShowOfferForm(true)}>
                  💰 Make an Offer
                </button>
              )}
            </div>
          )}

          <div className={styles.inputRow}>
            <input
              className={styles.input}
              type="text"
              placeholder="Type a message…"
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <button className={styles.sendBtn} onClick={handleSend} disabled={!isConnected}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
