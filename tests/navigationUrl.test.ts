import { expect, it } from 'vitest';
import { isNavigationUrl, matchCandidateUrl } from '../lib/navigationUrl';

it.each([undefined, null, 1, '', '/path', '//example.com/', 'javascript:alert(1)', 'data:text/html,test', 'file:///tmp/test', 'https://', 'https:///example.com', 'https://:443/', 'https://[::1', 'https://example.com:99999/', 'https://user:pass@example.com/', 'https://@example.com/', 'https://example.com@evil.example/', ' https://example.com/', 'https://example.com/\n', 'https://exa\tmple.com/', 'https://example.com\\evil', 'https://example.com/%zz'])('rejects unsafe or malformed navigation value %j', (value) => {
  expect(isNavigationUrl(value)).toBe(false);
  expect(matchCandidateUrl(value, typeof value === 'string' ? [{ url: value }] : [])).toBeNull();
});

it.each(['http://example.com/', 'https://example.com/path?q=日本語#part', 'https://例え.テスト/', 'https://example.com:8443/a%20b'])('accepts a valid exact candidate without changing its URL: %s', (url) => {
  expect(isNavigationUrl(url)).toBe(true);
  expect(matchCandidateUrl(url, [{ url }])).toBe(url);
});

it.each(['https://EXAMPLE.com/', 'https://example.com', 'https://example.com:443/', 'https://example.com/other/../'])('does not infer equivalence from a different representation: %s', (url) => {
  expect(matchCandidateUrl(url, [{ url: 'https://example.com/' }])).toBeNull();
});
