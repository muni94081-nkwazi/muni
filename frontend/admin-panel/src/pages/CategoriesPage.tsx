import React from 'react';
import { CategoryHierarchy } from '../components/categories/CategoryHierarchy';
import { CategoryList } from '../components/categories/CategoryList';

export const CategoriesPage: React.FC = () => (
  <div style={{ padding: 'var(--space-4)' }}>
    <h1>Category Management</h1>
    <p style={{ color: 'var(--color-text-secondary)', marginTop: 'calc(-1 * var(--space-2))', marginBottom: 'var(--space-4)' }}>
      Build and maintain the catalog hierarchy — expand or collapse branches, add subcategories up to
      4 levels deep, and set the commission fee sellers pay per category.
    </p>

    <div style={{ marginBottom: 'var(--space-6)' }}>
      <CategoryHierarchy />
    </div>

    <div>
      <h3 style={{ marginBottom: 'var(--space-3)' }}>All Categories</h3>
      <CategoryList />
    </div>
  </div>
);
