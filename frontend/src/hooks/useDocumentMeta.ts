import { useEffect } from 'react';

interface MetaOptions {
  title: string;
  description?: string;
  /** Canonical URL — defaults to current href */
  canonical?: string;
  /** og:image absolute URL */
  ogImage?: string;
}

function setMeta(name: string, content: string, attr: 'name' | 'property' = 'name') {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href: string) {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Sets document.title and injects/updates standard SEO meta tags.
 * No external dependency needed — works directly with the DOM.
 * Reverts to the base title on unmount.
 */
export function useDocumentMeta({ title, description, canonical, ogImage }: MetaOptions) {
  useEffect(() => {
    const prev = document.title;
    document.title = title;

    if (description) {
      setMeta('description', description);
      setMeta('og:description', description, 'property');
      setMeta('twitter:description', description, 'name');
    }

    setMeta('og:title', title, 'property');
    setMeta('twitter:title', title, 'name');
    setMeta('twitter:card', 'summary', 'name');

    const href = canonical ?? window.location.href;
    setLink('canonical', href);
    setMeta('og:url', href, 'property');

    if (ogImage) {
      setMeta('og:image', ogImage, 'property');
      setMeta('twitter:image', ogImage, 'name');
    }

    return () => {
      document.title = prev;
    };
  }, [title, description, canonical, ogImage]);
}
