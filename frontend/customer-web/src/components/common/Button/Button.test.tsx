import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('renders its children', () => {
    render(<Button>Add to cart</Button>);
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Buy now</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Buy now' }));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled and does not fire onClick while isLoading', async () => {
    const handleClick = vi.fn();
    render(
      <Button onClick={handleClick} isLoading>
        Placing order
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Placing order' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    await userEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('respects an explicit disabled prop', () => {
    render(<Button disabled>Out of stock</Button>);
    expect(screen.getByRole('button', { name: 'Out of stock' })).toBeDisabled();
  });

  it('forwards a ref to the underlying button element', () => {
    let ref: HTMLButtonElement | null = null;
    render(
      <Button
        ref={(node) => {
          ref = node;
        }}
      >
        Checkout
      </Button>,
    );
    expect(ref).toBeInstanceOf(HTMLButtonElement);
  });
});
