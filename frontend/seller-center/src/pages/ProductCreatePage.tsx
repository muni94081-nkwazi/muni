import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ProductForm, type ProductSubmitValues } from '../components/products/ProductForm';
import { useProducts } from '../hooks/useProducts';
import { useToast } from '../hooks/useToast';

export const ProductCreatePage: React.FC = () => {
  const { createProduct, isLoading } = useProducts();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (values: ProductSubmitValues) => {
    // What a rejected createAsyncThunk resolves to: `error` marks the failure,
    // `payload` carries whatever rejectWithValue was given in productSlice.
    const result = (await createProduct(values)) as {
      error?:   unknown;
      payload?: unknown;
    };

    // createAsyncThunk resolves whether the request succeeded or not; the
    // rejected action carries the reason in `payload` (what rejectWithValue was
    // given in productSlice).
    //
    // The reason is read from the RESULT, not from the hook's `error`. That
    // field comes from the render closure this handler was created in, so at
    // this point it still holds whatever the error was BEFORE this save — null
    // on a first attempt. Every failed create therefore showed the generic
    // fallback instead of the field-level message the server sent back.
    if (result?.error) {
      showError(
        typeof result.payload === 'string' && result.payload
          ? result.payload
          : 'Could not create the product. Please try again.',
      );
      return;
    }

    // Wording matters here: the product is submitted, not published. It only
    // reaches customers once an admin approves it. A draft is neither.
    showSuccess(
      values.status === 'DRAFT'
        ? 'Draft saved. It stays private until you submit it for review.'
        : 'Product submitted for review. It goes live once an admin approves it.',
    );
    navigate('/products');
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <header style={{ marginBottom: 'var(--spacing-6)' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--color-text-primary)' }}>
          Add a product
        </h1>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
          New listings are reviewed by an admin before they appear on the storefront.
          Save a draft if you are not ready to submit.
        </p>
      </header>

      <ProductForm onSubmit={handleSubmit} isLoading={isLoading} />
    </div>
  );
};
