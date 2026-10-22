// Les pages .html sont importées comme texte (règle « Text » de wrangler.toml).
import { readFileSync } from 'node:fs';

export default {
  plugins: [{
    name: 'html-texte',
    load(id) {
      if (id.endsWith('.html')) return `export default ${JSON.stringify(readFileSync(id, 'utf8'))};`;
    },
  }],
};
