import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { productsApi } from '@/api/products.api';
import type { Category } from '@/types/product.types';
import { logger } from '@/utils/logger';
import styles from './Footer.module.css';

/** Enough to be useful for crawlers and shoppers without turning the footer into a sitemap. */
const MAX_CATEGORIES = 12;

export interface FooterCategoriesProps {
  limit?: number;
}

/**
 * Shop-by-category strip, fetched from product-service.
 *
 * `GET /categories` is public at the gateway, so this works signed-out. The
 * request is fire-and-forget from the footer's point of view: on failure the
 * section renders nothing at all rather than showing an error band at the
 * bottom of every page — a footer is not where a shopper should learn the
 * catalogue API is down, and the page above is unaffected.
 *
 * Links are real <Link> elements to the existing /products route with a
 * category filter, so they are crawlable and no new route is invented.
 */
export function FooterCategories({ limit = MAX_CATEGORIES }: FooterCategoriesProps) {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let cancelled = false;

    productsApi
      .getCategories()
      .then((result) => {
        if (cancelled) return;
        setCategories(Array.isArray(result) ? result.slice(0, limit) : []);
      })
      .catch((error: unknown) => {
        logger.warn('footer categories unavailable', error);
        if (!cancelled) setCategories([]);
      });

    return () => {
      cancelled = true;
    };
  }, [limit]);

  if (categories.length === 0) return null;

  return (
    <nav className={styles.categoryStrip} aria-labelledby="footer-categories-heading">
      <h3 className={styles.categoryHeading} id="footer-categories-heading">
        Shop by category
      </h3>
      <ul className={styles.categoryList}>
        {categories.map((category) => (
          <li key={category.id}>
            <Link
              className={styles.categoryLink}
              to={`/products?category=${encodeURIComponent(category.slug ?? category.id)}`}
            >
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
