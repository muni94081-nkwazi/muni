import React, { useEffect } from 'react';
import { ProductForm } from './ProductForm';
import { useProducts } from '../../hooks/useProducts';
import { useToast } from '../../hooks/useToast';
import { LoadingState } from '../common/LoadingState';

export const ProductEdit: React.FC<{ id: string }> = ({ id }) => {
  const { currentProduct, fetchProductById, updateProduct, isLoading } = useProducts() as any;
  const { showSuccess } = useToast();

  useEffect(() => {
    fetchProductById(id);
  }, [id]);

  const handleSubmit = async (values: any) => {
    await updateProduct(id, values);
    showSuccess('Product updated successfully');
  };

  if (!currentProduct) return <LoadingState />;

  return (
    <div>
      <h2>Edit Product</h2>
      <ProductForm initialValues={currentProduct} onSubmit={handleSubmit} isLoading={isLoading} />
    </div>
  );
};
