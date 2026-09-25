/**
 * Génère les deux tables pays embarquées dans le Worker :
 *   src/data/countries.json       { "BE": [lat, lon], … }  — 243 pays ISO-3166
 *   src/data/country-names.json   { "belgique": "BE", … }  — noms FR + EN + alias
 *
 * Source des coordonnées : eesur/country-codes-lat-long (domaine public).
 * Source des noms : Intl.DisplayNames de Node (ICU complet), en fr puis en en —
 * donc tous les pays sont reconnus dans les deux langues, sans liste à tenir.
 *
 *   node scripts/gen-countries.mjs
 *
 * À relancer seulement pour rafraîchir les données ; le résultat est versionné.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = 'https://raw.githubusercontent.com/eesur/country-codes-lat-long/master/country-codes-lat-long-alpha3.json';
const ici = dirname(fileURLToPath(import.meta.url));
const data = join(ici, '..', 'src', 'data');

/** même normalisation que geocode.ts : minuscules, sans accents ni tirets */
const norm = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’\-.]/g, ' ').replace(/\s+/g, ' ').trim();

/* Formes courantes qu'aucune table officielle ne donne — on les ajoute à la main. */
const ALIAS = {
  usa: 'US', 'etats unis': 'US', amerique: 'US', uk: 'GB', angleterre: 'GB',
  ecosse: 'GB', 'pays de galles': 'GB', hollande: 'NL', birmanie: 'MM',
  rdc: 'CD', 'congo kinshasa': 'CD', 'congo brazzaville': 'CG',
  'coree du sud': 'KR', coree: 'KR', 'coree du nord': 'KP',
  'emirats arabes unis': 'AE', emirats: 'AE', 'republique tcheque': 'CZ',
  tchequie: 'CZ', 'cote divoire': 'CI', 'ivory coast': 'CI',
  'republique dominicaine': 'DO', 'afrique du sud': 'ZA', 'arabie saoudite': 'SA',
};

const brut = await (await fetch(SRC)).json();
const liste = brut.ref_country_codes || brut;

const coords = {};
for (const p of liste) {
  if (!p.alpha2 || p.latitude == null || p.longitude == null) continue;
  coords[p.alpha2] = [+(+p.latitude).toFixed(3), +(+p.longitude).toFixed(3)];
}

const noms = {};
const pose = (nom, code) => { const n = norm(nom); if (n && !noms[n]) noms[n] = code; };
for (const langue of ['fr', 'en']) {
  const dn = new Intl.DisplayNames([langue], { type: 'region' });
  for (const code of Object.keys(coords)) {
    let nom;
    try { nom = dn.of(code); } catch { nom = null; }
    if (nom && nom !== code) pose(nom, code);
  }
}
for (const p of liste) if (p.country && coords[p.alpha2]) pose(p.country, p.alpha2);
for (const [nom, code] of Object.entries(ALIAS)) if (coords[code]) pose(nom, code);

writeFileSync(join(data, 'countries.json'), JSON.stringify(coords));
writeFileSync(join(data, 'country-names.json'), JSON.stringify(noms));
console.log(`countries.json : ${Object.keys(coords).length} pays`);
console.log(`country-names.json : ${Object.keys(noms).length} noms reconnus`);
