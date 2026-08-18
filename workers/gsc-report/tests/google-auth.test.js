import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { extractPemBody, importPrivateKey } from '../src/google-auth.js';

/** Vraie clé PKCS8 générée pour les tests (format identique à celui de Google). */
const { privateKey: PEM } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const BODY = PEM.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');

describe('extractPemBody — tolérance aux formats de collage', () => {
  it('PEM brut avec vrais retours ligne', () => {
    expect(extractPemBody(PEM)).toBe(BODY);
  });

  it('valeur JSON avec \\n littéraux (copier-coller du champ private_key)', () => {
    const literal = PEM.replace(/\n/g, '\\n');
    expect(extractPemBody(literal)).toBe(BODY);
  });

  it('valeur collée avec ses guillemets', () => {
    const quoted = '"' + PEM.replace(/\n/g, '\\n') + '",';
    expect(extractPemBody(quoted)).toBe(BODY);
  });

  it('JSON complet du service account collé tel quel', () => {
    const json = JSON.stringify({ type: 'service_account', private_key: PEM, client_email: 'x@y.iam' });
    expect(extractPemBody(json)).toBe(BODY);
  });

  it('erreur explicite si le bloc BEGIN/END manque', () => {
    expect(() => extractPemBody('pas une clé')).toThrow(/BEGIN PRIVATE KEY/);
    expect(() => extractPemBody('')).toThrow(/vide/);
  });

  it('erreur explicite si la clé est tronquée', () => {
    const truncated = PEM.slice(0, 400) + '\n-----END PRIVATE KEY-----\n';
    expect(() => extractPemBody(truncated)).toThrow(/tronquée/);
  });
});

describe('importPrivateKey', () => {
  it('importe une vraie clé PKCS8 sous tous les formats', async () => {
    for (const variant of [PEM, PEM.replace(/\n/g, '\\n'), JSON.stringify({ private_key: PEM })]) {
      const key = await importPrivateKey(variant);
      expect(key.type).toBe('private');
      expect(key.algorithm.name).toBe('RSASSA-PKCS1-v1_5');
    }
  });

  it('erreur lisible sur une clé au bon gabarit mais corrompue', async () => {
    // Corrompt l'en-tête DER (début du corps base64) : longueur plausible,
    // structure invalide — le cas d'un collage altéré.
    const lines = PEM.trim().split('\n');
    lines[1] = 'AAAA' + lines[1].slice(4);
    const corrupted = lines.join('\n');
    await expect(importPrivateKey(corrupted)).rejects.toThrow(/PKCS8 invalide|base64 invalide/);
  });
});
