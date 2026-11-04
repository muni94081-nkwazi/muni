import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const appRoot = resolve(here, '../..');

/**
 * Guards the Content-Security-Policy the nginx edge sends.
 *
 * CSP fails silently and at runtime: a blocked script does not break the build,
 * does not fail a type-check, and does not throw anywhere a test would see. It
 * just stops working in a browser, usually on a page nobody opened during
 * review. The inline `onload` on the web-font <link> was exactly that — it
 * would have stopped applying fonts the moment the policy shipped, with nothing
 * anywhere to say so.
 *
 * These assertions are cheap and catch the two ways the policy and the app
 * drift apart: markup growing something the policy forbids, and the policy
 * losing an origin the markup needs.
 */

function readIndexHtml(): string {
  // Prefer the built output — that is what the edge actually serves and what
  // the policy applies to. Fall back to the source when dist/ is absent, so
  // this test does not require a build to have run first.
  const built = resolve(appRoot, 'dist/index.html');
  const source = resolve(appRoot, 'index.html');
  return readFileSync(existsSync(built) ? built : source, 'utf8');
}

/** Strips HTML comments, so prose describing a handler is not read as one. */
function withoutComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

const html = withoutComments(readIndexHtml());
const nginxCommon = readFileSync(
  resolve(repoRoot, 'nginx/includes/server-common.conf'),
  'utf8',
);

const cspDirectives = (() => {
  const match = /add_header Content-Security-Policy "([^"]+)"/.exec(nginxCommon);
  if (!match) throw new Error('No Content-Security-Policy add_header found in server-common.conf');

  return Object.fromEntries(
    match[1]
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/);
        return [name, values];
      }),
  ) as Record<string, string[]>;
})();

describe('index.html satisfies script-src without unsafe-inline', () => {
  it('has no inline event handler attributes', () => {
    // on* attributes are inline script to CSP. `script-src 'self'` blocks every
    // one of them, and the failure mode is that the handler simply never runs.
    const handlers = html.match(/\son[a-z]+\s*=/gi) ?? [];
    expect(handlers).toEqual([]);
  });

  it('has no inline <script> body — every script is an external file', () => {
    const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
      .map((m) => m[1].trim())
      .filter(Boolean);
    expect(inlineScripts).toEqual([]);
  });

  it('has no javascript: URLs', () => {
    expect(html).not.toMatch(/href\s*=\s*["']javascript:/i);
  });
});

describe('the policy covers what index.html actually loads', () => {
  it('allows every external origin the document references', () => {
    // Anything the markup points at must be permitted by SOME directive, or the
    // resource is blocked. Checked against the union rather than per-directive
    // so this does not have to model which directive owns which element type.
    const referenced = new Set(
      [...html.matchAll(/https:\/\/([a-z0-9.-]+)/gi)].map((m) => `https://${m[1]}`),
    );
    const allowed = Object.values(cspDirectives).flat().join(' ');

    for (const origin of referenced) {
      expect(
        allowed.includes(origin) || allowed.includes('https:'),
        `${origin} is referenced by index.html but no CSP directive allows it`,
      ).toBe(true);
    }
  });

  it('allows the Google Fonts stylesheet origin in style-src', () => {
    expect(cspDirectives['style-src']).toContain('https://fonts.googleapis.com');
  });

  it('allows the Google Fonts file origin in font-src', () => {
    // googleapis.com serves the CSS, gstatic.com serves the .woff2 files.
    // Allowing only the first fetches a stylesheet whose every @font-face fails.
    expect(cspDirectives['font-src']).toContain('https://fonts.gstatic.com');
  });
});

describe('the policy covers what the image pipeline needs', () => {
  it('allows data: images', () => {
    // utils/imageFallback.ts inlines an SVG placeholder as a data: URI, and
    // imageOptimization.ts probes AVIF/WebP support with data: images.
    expect(cspDirectives['img-src']).toContain('data:');
  });

  it('allows blob: images', () => {
    // OptimizedImage passes blob: URLs through for locally-previewed uploads.
    expect(cspDirectives['img-src']).toContain('blob:');
  });
});

describe('the policy keeps its teeth', () => {
  it('does not allow inline script', () => {
    expect(cspDirectives['script-src']).not.toContain("'unsafe-inline'");
    expect(cspDirectives['script-src']).not.toContain("'unsafe-eval'");
  });

  it('pins the fallback, so an unlisted resource type is denied not defaulted', () => {
    expect(cspDirectives['default-src']).toEqual(["'self'"]);
  });

  it('forbids framing and plugin content', () => {
    expect(cspDirectives['frame-ancestors']).toEqual(["'none'"]);
    expect(cspDirectives['object-src']).toEqual(["'none'"]);
  });

  it('is marked `always`, so it is sent on error responses too', () => {
    // Without `always`, nginx omits add_header on 4xx/5xx — which is precisely
    // where an injected error page would be rendered.
    expect(nginxCommon).toMatch(/add_header Content-Security-Policy "[^"]+" always;/);
  });
});
