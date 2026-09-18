const PUBLISHABLE_KEY = /^sb_publishable_[A-Za-z0-9_-]{20,}$/u;
const BASE64URL = /^[A-Za-z0-9_-]+$/u;

const decodeBase64UrlJson = (segment) => {
  if (!BASE64URL.test(segment)) return null;
  try {
    const padded = segment.replaceAll('-', '+').replaceAll('_', '/')
      .padEnd(Math.ceil(segment.length / 4) * 4, '=');
    const text = typeof Buffer === 'function'
      ? Buffer.from(padded, 'base64').toString('utf8')
      : decodeURIComponent(Array.from(atob(padded), character => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
};

/**
 * Classifies only credentials that Supabase documents as safe for a public
 * client. It deliberately does not accept arbitrary long strings: a
 * privileged key placed in VITE_SUPABASE_ANON_KEY must still fail closed.
 */
export const isSafePublicSupabaseCredential = (value) => {
  if (typeof value !== 'string' || !value || value.trim() !== value) return false;
  if (PUBLISHABLE_KEY.test(value)) return true;
  if (value.startsWith('sb_secret_')) return false;

  const segments = value.split('.');
  if (segments.length !== 3 || segments.some(segment => !segment || !BASE64URL.test(segment))) return false;
  const header = decodeBase64UrlJson(segments[0]);
  const payload = decodeBase64UrlJson(segments[1]);
  return header?.alg === 'HS256'
    && typeof header.typ === 'string'
    && header.typ.toUpperCase() === 'JWT'
    && payload?.role === 'anon';
};

export const canonicalSupabasePublicOrigin = (value) => {
  if (typeof value !== 'string' || value.trim() !== value || !value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !/^[a-z0-9]{20}[.]supabase[.]co$/u.test(parsed.hostname)
      || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch {
    return null;
  }
};
