// Tests de la vérification des liens : un cas HTML par résultat possible.
import { describe, it, expect } from 'vitest';
import { analyzeHtml, classify, checkLink, shouldMarkLost, parseAttributes } from '../src/check.js';

const PAGE = 'https://blog-partenaire.fr/article';
const CLIENT = 'client.fr';
const base = { status: 200, contentType: 'text/html; charset=utf-8', robotsHeader: null, pageUrl: PAGE, clientDomain: CLIENT };
const page = (body, head = '') => `<!doctype html><html><head>${head}</head><body><p>${'Texte de contenu. '.repeat(20)}</p>${body}</body></html>`;

describe('parseAttributes', () => {
  it('guillemets doubles, simples, sans guillemets, entités', () => {
    expect(parseAttributes(' href="https://a.fr/?x=1&amp;y=2" rel=\'nofollow noopener\' target=_blank'))
      .toEqual({ href: 'https://a.fr/?x=1&y=2', rel: 'nofollow noopener', target: '_blank' });
  });
});

describe('analyzeHtml', () => {
  it('ne garde que les liens vers le client, résout les relatifs, ignore commentaires et scripts', () => {
    const html = page(`
      <a href="https://www.client.fr/">ok</a>
      <a href="https://autre.fr/">autre</a>
      <a href="/interne">interne</a>
      <!-- <a href="https://client.fr/commente">x</a> -->
      <script>document.write('<a href="https://client.fr/js">x</a>')</script>
      <A HREF="https://blog.client.fr/p" REL="ugc">maj</A>`);
    const { links } = analyzeHtml(html, PAGE, CLIENT);
    expect(links).toEqual([
      { href: 'https://www.client.fr/', rel: '' },
      { href: 'https://blog.client.fr/p', rel: 'ugc' },
    ]);
  });
});

describe('classify', () => {
  it('live_dofollow', () => {
    const out = classify({ ...base, html: page('<a href="https://client.fr/" rel="noopener">x</a>') });
    expect(out.result).toBe('live_dofollow');
  });

  it.each(['nofollow', 'sponsored', 'UGC', 'noopener nofollow'])('live_nofollow via rel="%s"', (rel) => {
    expect(classify({ ...base, html: page(`<a href="https://client.fr/" rel="${rel}">x</a>`) }).result).toBe('live_nofollow');
  });

  it('un lien suivi parmi plusieurs suffit', () => {
    const html = page('<a href="https://client.fr/a" rel="nofollow">a</a><a href="https://client.fr/b">b</a>');
    expect(classify({ ...base, html }).result).toBe('live_dofollow');
  });

  it('meta robots nofollow au niveau de la page', () => {
    const html = page('<a href="https://client.fr/">x</a>', '<meta name="robots" content="index, nofollow">');
    expect(classify({ ...base, html })).toMatchObject({ result: 'live_nofollow', detail: 'meta robots nofollow' });
  });

  it('meta robots « none »', () => {
    const html = page('<a href="https://client.fr/">x</a>', '<meta name="robots" content="none">');
    expect(classify({ ...base, html }).result).toBe('live_nofollow');
  });

  it('en-tête X-Robots-Tag nofollow', () => {
    const html = page('<a href="https://client.fr/">x</a>');
    expect(classify({ ...base, html, robotsHeader: 'googlebot: nofollow' }).result).toBe('live_nofollow');
  });

  it('missing : page normale sans lien', () => {
    expect(classify({ ...base, html: page('<a href="https://autre.fr/">x</a>') }).result).toBe('missing');
  });

  it('unverifiable : page rendue en JavaScript', () => {
    const html = '<html><head></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
    expect(classify({ ...base, html }).result).toBe('unverifiable');
  });

  it('http_error et blocage anti-bot', () => {
    expect(classify({ ...base, status: 404, html: '' }).result).toBe('http_error');
    expect(classify({ ...base, status: 500, html: '' }).result).toBe('http_error');
    expect(classify({ ...base, status: 403, html: '' }).result).toBe('unverifiable');
    expect(classify({ ...base, status: 200, blocked: true, html: '' }).result).toBe('unverifiable');
  });

  it('contenu non HTML', () => {
    expect(classify({ ...base, contentType: 'application/pdf', html: '' }).result).toBe('unverifiable');
  });
});

describe('checkLink', () => {
  it('télécharge la page et la classe', async () => {
    const fakeFetch = async (url, init) => {
      expect(init.headers['User-Agent']).toMatch(/BacklinkRadar/);
      return new Response(page('<a href="https://client.fr/">x</a>'), { status: 200, headers: { 'content-type': 'text/html' } });
    };
    expect(await checkLink(PAGE, CLIENT, fakeFetch)).toMatchObject({ http_status: 200, result: 'live_dofollow' });
  });

  it('erreur réseau → http_error', async () => {
    const out = await checkLink(PAGE, CLIENT, async () => { throw new Error('DNS'); });
    expect(out).toMatchObject({ http_status: null, result: 'http_error' });
  });
});

describe('shouldMarkLost', () => {
  it('deux échecs consécutifs seulement', () => {
    expect(shouldMarkLost(['missing', 'http_error'])).toBe(true);
    expect(shouldMarkLost(['missing'])).toBe(false);
    expect(shouldMarkLost(['missing', 'live_dofollow'])).toBe(false);
    expect(shouldMarkLost(['unverifiable', 'missing'])).toBe(false);
  });
});
