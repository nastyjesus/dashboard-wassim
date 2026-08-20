// Extrait les configs clients embarquées dans automations.html (source de
// vérité unique) pour les réutiliser dans le workflow de test.
// Usage : node .github/scripts/extract-configs.js gsc|geo
const fs = require('fs');

const which = process.argv[2] === 'geo' ? 'GEO_CLIENTS' : 'GSC_CLIENTS';
const html = fs.readFileSync('automations.html', 'utf8');
const m = html.match(new RegExp(`const ${which} = (\\[[\\s\\S]*?\\n\\]);`));
if (!m) {
  console.error(`${which} introuvable dans automations.html`);
  process.exit(1);
}
process.stdout.write(JSON.stringify(JSON.parse(m[1])));
