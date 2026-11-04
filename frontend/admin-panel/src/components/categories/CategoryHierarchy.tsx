import React, { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import {
  fetchCategories,
  createCategoryThunk,
  updateCategoryThunk,
  deleteCategoryThunk,
} from '@/store/slices/categorySlice';
import type { Category } from '@/types/category.types';
import { CategoryTreeBuilder } from './CategoryTreeBuilder';
import { CategoryForm, type CategoryFormValues } from './CategoryForm';
import { Drawer } from '../common/Drawer/Drawer';
import { Button } from '../common/Button/Button';
import { LoadingState } from '../common/LoadingState';
import { useToast } from '@/hooks/useToast';

type DrawerMode = { kind: 'create'; parentId: string | null } | { kind: 'edit'; category: Category } | null;

export const CategoryHierarchy: React.FC = () => {
  const dispatch = useAppDispatch();
  const { categories, loading } = useAppSelector((s) => s.categories);
  const { show } = useToast();
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { dispatch(fetchCategories()); }, [dispatch]);

  const closeDrawer = () => setDrawerMode(null);

  const handleSubmit = async (values: CategoryFormValues) => {
    setSubmitting(true);
    try {
      if (drawerMode?.kind === 'edit') {
        await dispatch(updateCategoryThunk({ id: drawerMode.category.id, data: values })).unwrap();
        show(`"${values.name}" updated.`, 'success');
      } else {
        await dispatch(createCategoryThunk(values)).unwrap();
        show(`"${values.name}" created.`, 'success');
      }
      closeDrawer();
    } catch {
      show('Something went wrong saving the category.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (category: Category) => {
    const hasChildren = categories.some((c) => c.parentId === category.id);
    const confirmMsg = hasChildren
      ? `Delete "${category.name}" and all of its subcategories?`
      : `Delete "${category.name}"?`;
    if (!window.confirm(confirmMsg)) return;
    try {
      await dispatch(deleteCategoryThunk(category.id)).unwrap();
      show(`"${category.name}" deleted.`, 'success');
      if (selectedId === category.id) setSelectedId(null);
    } catch {
      show('Failed to delete category.', 'error');
    }
  };

  if (loading && categories.length === 0) return <LoadingState />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
        <h3 style={{ margin: 0 }}>Category Tree</h3>
        <Button size="sm" variant="primary" onClick={() => setDrawerMode({ kind: 'create', parentId: null })}>
          + Add root category
        </Button>
      </div>

      <CategoryTreeBuilder
        categories={categories}
        selectedId={selectedId}
        onSelect={(c) => setSelectedId(c.id)}
        onAddChild={(parent) => setDrawerMode({ kind: 'create', parentId: parent.id })}
        onEdit={(c) => setDrawerMode({ kind: 'edit', category: c })}
        onDelete={handleDelete}
      />

      <Drawer
        isOpen={drawerMode !== null}
        onClose={closeDrawer}
        title={drawerMode?.kind === 'edit' ? `Edit "${drawerMode.category.name}"` : 'New category'}
      >
        {drawerMode && (
          <CategoryForm
            categories={categories}
            initial={drawerMode.kind === 'edit' ? drawerMode.category : null}
            defaultParentId={drawerMode.kind === 'create' ? drawerMode.parentId : null}
            onSubmit={handleSubmit}
            onCancel={closeDrawer}
            submitting={submitting}
          />
        )}
      </Drawer>
    </div>
  );
};
