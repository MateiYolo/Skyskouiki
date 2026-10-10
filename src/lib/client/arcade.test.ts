import { describe, expect, it } from 'vitest';
import { arcadeText } from './arcade';

describe('texte de borne', () => {
  it('passe en capitales et retire les accents', () => {
    expect(arcadeText('À toi')).toBe('A TOI');
    expect(arcadeText('Colonne éliminée')).toBe('COLONNE ELIMINEE');
    expect(arcadeText('On t’a volé !')).toBe('ON T’A VOLE !');
  });
});
