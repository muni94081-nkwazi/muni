import { useState } from 'react';
import type { ProductReview as ProductReviewType } from '@/types/product.types';
import { formatDate } from '@/utils/formatters';
import { Button } from '@/components/common/Button/Button';
import { productsApi } from '@/api/products.api';
import { useAppDispatch } from '@/store/hooks/useAppSelector';
import { showToast } from '@/store/slices/uiSlice';
import { errorMessage } from '@/utils/helpers';

export interface ProductReviewListProps {
  reviews: ProductReviewType[];
}

export function ProductReviewList({ reviews }: ProductReviewListProps) {
  if (reviews.length === 0) {
    return <p style={{ color: 'var(--color-text-secondary)' }}>No reviews yet. Be the first to leave one.</p>;
  }

  return (
    <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {reviews.map((review) => (
        <li key={review.id} style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
            <strong>{review.userName}</strong>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
              {formatDate(review.createdAt)}
            </span>
          </div>
          <div style={{ color: 'var(--color-marigold-dark)', marginBottom: 'var(--space-2)' }}>
            {'★'.repeat(review.rating)}
            {'☆'.repeat(5 - review.rating)}
          </div>
          {review.title && <p style={{ fontWeight: 600, marginBottom: 'var(--space-1)' }}>{review.title}</p>}
          {review.content && <p style={{ color: 'var(--color-text-secondary)' }}>{review.content}</p>}
          {review.verifiedPurchase && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)', fontWeight: 600 }}>
              ✓ Verified purchase
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export interface ProductReviewFormProps {
  productId: string;
  onSubmitted: () => void;
}

export function ProductReviewForm({ productId, onSubmitted }: ProductReviewFormProps) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dispatch = useAppDispatch();

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      await productsApi.addReview(productId, { rating, content: comment });
      dispatch(showToast('Thanks for your review!', 'success'));
      setComment('');
      onSubmitted();
    } catch (error) {
      dispatch(showToast(errorMessage(error, 'Could not submit your review'), 'error'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div>
        <label style={{ fontWeight: 600, fontSize: 'var(--text-sm)', display: 'block', marginBottom: 'var(--space-2)' }}>
          Your rating
        </label>
        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              aria-label={`${value} star${value === 1 ? '' : 's'}`}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 'var(--text-2xl)',
                color: value <= rating ? 'var(--color-marigold-dark)' : 'var(--color-border)',
              }}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Tell other shoppers what you thought..."
        rows={4}
        style={{
          width: '100%',
          padding: 'var(--space-3)',
          borderRadius: 'var(--radius-md)',
          border: '1.5px solid var(--color-border)',
          fontFamily: 'inherit',
          resize: 'vertical',
        }}
      />
      <Button onClick={handleSubmit} isLoading={isSubmitting} style={{ alignSelf: 'flex-start' }}>
        Submit review
      </Button>
    </div>
  );
}
