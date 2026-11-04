/**
 * CartItem declared its own props shape (`name`, `imageUrl`, `maxStock`) that
 * did not match what cart-service returns (`productName`, `productImage`,
 * `maxQuantity`), and reported quantity changes and removals by productId.
 *
 * cart-service addresses a cart LINE by its own `id` — the same product in two
 * variants is two lines — so keying on productId is the bug api/cart.api.ts
 * documents as already fixed once. These tests hold both contracts.
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

// The real icon set reaches expo-font → expo-asset, which is not installed as a
// standalone package here. The icons carry no behaviour this test cares about —
// the pressables are found by their accessibility labels.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));

import React from 'react';
import { act, create, type TestInstance, type TestRendererJSON } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import uiReducer, { setCurrency } from '@/store/ui.slice';
import { CartItem } from '../CartItem';
import type { CartItem as CartLine } from '@/types';

/** A cart line exactly as cart-service sends it. */
const LINE: CartLine = {
  id: 'line-1',
  productId: 'product-9',
  sellerId: 'seller-1',
  productName: 'Kampala Premium Coffee',
  productImage: 'https://cdn.example/coffee.jpg',
  variantLabel: '500g',
  price: 15000,
  quantity: 2,
  maxQuantity: 5,
  addedAt: new Date().toISOString(),
};

function textOf(node: TestRendererJSON | TestRendererJSON[] | null): string {
  if (node === null) return '';
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  const children = node.children ?? [];
  return children.map((child) => (typeof child === 'string' ? child : textOf(child))).join(' ');
}

async function renderLine(overrides: Partial<CartLine> = {}) {
  const store = configureStore({ reducer: { ui: uiReducer } });
  store.dispatch(setCurrency('UGX'));

  const onQuantityChange = jest.fn();
  const onRemove = jest.fn();

  let renderer!: ReturnType<typeof create>;
  // Awaited so the tree is committed before anything reads or presses it.
  await act(async () => {
    renderer = create(
      <Provider store={store}>
        <CartItem
          item={{ ...LINE, ...overrides }}
          onQuantityChange={onQuantityChange}
          onRemove={onRemove}
        />
      </Provider>,
    );
  });

  /** First node carrying this accessibility label that can actually be pressed. */
  const press = async (label: string) => {
    const target = renderer.root
      .findAll((node: TestInstance) => node.props?.accessibilityLabel === label)
      .find((node) => typeof node.props?.onPress === 'function');
    if (!target) throw new Error(`No pressable found for "${label}"`);
    await act(async () => {
      (target.props.onPress as () => void)();
    });
  };

  return { renderer, onQuantityChange, onRemove, press, text: () => textOf(renderer.toJSON()) };
}

describe('CartItem', () => {
  it('reads the fields cart-service actually sends', async () => {
    const { text } = await renderLine();

    // Against the old local type these came back undefined and rendered blank.
    expect(text()).toContain('Kampala Premium Coffee');
    expect(text()).toContain('500g');
  });

  it('formats the line total with the app formatter, not a hardcoded $', async () => {
    const { text } = await renderLine();

    // 15000 × 2, in the selected currency.
    expect(text().replace(/[^\d]/g, '')).toContain('30000');
    expect(text()).not.toContain('$');
  });

  it('removes by the cart line id, not the product id', async () => {
    const { onRemove, press } = await renderLine();

    await press('Remove Kampala Premium Coffee from cart');

    expect(onRemove).toHaveBeenCalledWith('line-1');
    expect(onRemove).not.toHaveBeenCalledWith('product-9');
  });

  it('changes quantity by the cart line id', async () => {
    const { onQuantityChange, press } = await renderLine();

    await press('Increase quantity');

    expect(onQuantityChange).toHaveBeenCalledWith('line-1', 3);
  });

  it('will not raise quantity past the stock ceiling', async () => {
    // maxQuantity is the seller's ceiling; the service rejects anything above it.
    const { onQuantityChange, press } = await renderLine({ quantity: 5, maxQuantity: 5 });

    await press('Increase quantity');

    expect(onQuantityChange).not.toHaveBeenCalled();
  });
});
