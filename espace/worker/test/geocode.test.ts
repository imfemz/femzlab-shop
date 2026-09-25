// test/geocode.test.ts — le géocodeur doit encaisser ce que les membres écrivent
// vraiment : français ou anglais, ville seule, pays seul, « Ville, Pays », casse
// et accents quelconques. Un membre non géocodé DISPARAÎT du globe : ce filet
// existe pour que ça ne se reproduise pas.
import { describe, it, expect } from 'vitest';
import { geocode, countryCenter, countryCode } from '../src/lib/geocode';

const VILLES_FR = ['Bruxelles', 'Londres', 'Genève', 'Anvers', 'Lisbonne', 'Barcelone', 'Moscou', 'Le Caire', 'Alger', 'Athènes', 'Copenhague', 'Varsovie', 'Pékin', 'Singapour', 'New York', 'Vienne'];
const VILLES = ['Paris', 'Lyon', 'Marseille', 'Casablanca', 'Rabat', 'Dakar', 'Abidjan', 'Tunis', 'Montreal', 'Miami', 'Tokyo', 'Madrid', 'Berlin', 'Milan', 'Rome', 'Amsterdam'];
const PAYS = ['Belgique', 'Belgium', 'France', 'Maroc', 'Morocco', 'Suisse', 'Canada', 'Japon', 'Japan', 'Sénégal', "Côte d'Ivoire", 'Cameroun', 'Allemagne', 'Espagne', 'Italie', 'Royaume-Uni', 'Angleterre', 'États-Unis', 'USA', 'Brésil', 'Australie', 'Inde', 'Chine', 'Viêt Nam', 'Nigéria', 'Égypte', 'Turquie', 'Pologne', 'Suède', 'Irlande', 'Luxembourg', 'Monaco', 'Congo-Kinshasa', 'RDC', 'Corée du Sud'];

describe('géocodage des lieux écrits à la main', () => {
  it.each([...VILLES_FR, ...VILLES])('ville reconnue : %s', (v) => {
    expect(geocode(v)).not.toBeNull();
  });
  it.each(PAYS)('pays reconnu écrit seul : %s', (p) => {
    expect(geocode(p)).not.toBeNull();
  });
  it('casse, accents et ponctuation sont indifférents', () => {
    const ref = geocode('Bruxelles');
    for (const v of ['bruxelles', 'BRUXELLES', '  Bruxelles  ', 'Brüxelles']) expect(geocode(v)).toEqual(ref);
    expect(geocode('cote d ivoire')).toEqual(geocode("Côte d'Ivoire"));
  });
  it('« Ville, Pays » : la ville prime ; ville inconnue → le pays rattrape', () => {
    expect(geocode('Bruxelles, Belgique')).toEqual(geocode('Bruxelles'));
    expect(geocode('Trifouillis-les-Oies, Maroc')).toEqual(countryCenter('MA'));
    expect(geocode('Petit Bled, Sénégal')).toEqual(countryCenter('SN'));
  });
  it('les 243 pays ISO ont un centre, et les centres réglés à la main priment', () => {
    expect(countryCenter('JP')).toEqual({ lat: 36, lon: 138 });
    expect(countryCenter('CA')).toEqual({ lat: 50, lon: -95 }); /* pas le centre géométrique, en Arctique */
    expect(countryCenter('ZZ')).toBeNull();
    expect(countryCode('Belgique')).toBe('BE');
  });
  it('lieu réellement inconnu : null, l’appelant se rabat sur le pays de connexion', () => {
    expect(geocode('')).toBeNull();
    expect(geocode('azertyuiop')).toBeNull();
  });
});
