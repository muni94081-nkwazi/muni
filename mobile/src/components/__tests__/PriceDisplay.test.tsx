/**
 * PriceDisplay used to multiply every price by a hardcoded "dummy" rate
 * (UGX = 3800 × USD) before rendering. Catalogue prices already arrive in their
 * own currency, so a UGX 15,000 product rendered as UGX 57,000,000 whenever the
 * display currency was UGX. These tests pin the price to what it was given.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));

import React from 'react';
import { act, create, type TestRendererJSON } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import uiReducer, { setCurrency } from '@/store/ui.slice';
import { PriceDisplay } from '../PriceDisplay';

/** Every string rendered anywhere in the tree, flattened. */
function textOf(node: TestRendererJSON | TestRendererJSON[] | null): string {
  if (node === null) return '';
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  const children = node.children ?? [];
  return children
    .map((child) => (typeof child === 'string' ? child : textOf(child)))
    .join(' ');
}

/** Renders and reads the tree only once React has committed it. */
async function render(element: React.ReactElement, currency = 'UGX') {
  const store = configureStore({ reducer: { ui: uiReducer } });
  store.dispatch(setCurrency(currency));

  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<Provider store={store}>{element}</Provider>);
  });
  return textOf(renderer.toJSON());
}

describe('PriceDisplay', () => {
  it('renders the price it was given, with no conversion applied', async () => {
    const text = await render(<PriceDisplay price={15000} />, 'UGX');

    // The digits must be the catalogue's, whatever the grouping/symbol style.
    expect(text.replace(/[^\d]/g, '')).toContain('15000');
    // 15000 × 3800 — the old hardcoded rate. Must not appear.
    expect(text.replace(/[^\d]/g, '')).not.toContain('57000000');
  });

  it('does not convert when the display currency changes either', async () => {
    const text = await render(<PriceDisplay price={15000} />, 'USD');
    expect(text.replace(/[^\d]/g, '')).toContain('15000');
  });

  it('honours the currency prop as a display override', async () => {
    const text = await render(<PriceDisplay price={2500} currency="USD" />, 'UGX');
    expect(text.replace(/[^\d]/g, '')).toContain('2500');
  });

  it('shows the original price struck through when it is a real markdown', async () => {
    const text = await render(<PriceDisplay price={8000} originalPrice={10000} />);
    const digits = text.replace(/[^\d]/g, '');
    expect(digits).toContain('8000');
    expect(digits).toContain('10000');
  });

  it('hides the original price when it is not actually higher', async () => {
    // Rendering it anyway would show a struck-through "discount" that is not one.
    const text = await render(<PriceDisplay price={10000} originalPrice={10000} />);
    expect(text.replace(/[^\d]/g, '')).toBe('10000');
  });
});
