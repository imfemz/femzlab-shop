import { describe, it, expect } from 'vitest';
import { productFromSlug, productFromPodiaName } from '../src/lib/products';

describe('correspondance des produits', () => {
  it('déduit le produit canonique depuis le slug de la page de remerciement', () => {
    expect(productFromSlug('/motionlab/thanks')).toBe('MotionLAB');
    expect(productFromSlug('/metavision/thanks')).toBe('MetaVision');
    expect(productFromSlug('/vortex-pack/thanks')).toBe('Vortex Sound Pack');
    expect(productFromSlug('/sfx-whoosh-pack/thanks')).toBe('Whoosh Sound Pack');
    expect(productFromSlug('/produit-inconnu/thanks')).toBeNull();
    expect(productFromSlug('')).toBeNull();
  });
  it('déduit le produit canonique depuis le nom Podia (import CSV)', () => {
    expect(productFromPodiaName('METAVISION - Formation VFX')).toBe('MetaVision');
    expect(productFromPodiaName('MotionLAB')).toBe('MotionLAB');
    expect(productFromPodiaName('Produit disparu')).toBeNull();
  });
});
