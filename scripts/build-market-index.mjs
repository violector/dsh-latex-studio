import { readFile, writeFile } from 'node:fs/promises';
import { parseMarketIndex, marketInstallTarget } from '@deepseek-ai/dsh-plugin-market-index';

const [commit, timestamp] = process.argv.slice(2);
const publishTimestamp = Number(timestamp);
if (!/^[0-9a-f]{40}$/.test(commit || '') || !Number.isSafeInteger(publishTimestamp) || publishTimestamp <= 0) {
  throw new Error('Usage: npm run market:index -- <40-character-release-commit> <publication-unix-seconds>');
}
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const repository = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
const indexUrl = 'https://raw.githubusercontent.com/violector/dsh-latex-studio/main/marketplace/index.json';
const index = {
  format: 1,
  title: { en: 'LaTeX Studio', zh: 'LaTeX Studio 论文写作' },
  description: { en: 'Releases from the LaTeX Studio project.', zh: 'LaTeX Studio 项目发布的插件版本。' },
  metadata: {
    categories: { docs: { title: { en: 'Scientific writing', zh: '科研写作' } } },
    labels: { windows: { title: { en: 'Windows desktop', zh: 'Windows 桌面版' } } },
  },
  plugins: [{
    name: pkg.name,
    title: 'LaTeX Studio',
    description: {
      en: 'AI LaTeX writing, 24 template presets, managed compilation, PDF preview and BibTeX validation for Windows desktop.',
      zh: 'Windows 桌面版 AI LaTeX 写作，24 个模板入口、受管编译、PDF 预览与 BibTeX 校验。',
    },
    icon: `data:image/svg+xml;base64,${(await readFile('icon.svg')).toString('base64')}`,
    author: pkg.author,
    homepage: pkg.homepage,
    repository: { url: repository },
    keywords: pkg.keywords,
    metadata: { category: 'docs', labels: ['windows'] },
    versions: [{
      version: pkg.version,
      publishTimestamp,
      source: { type: 'git', url: repository, commit },
      engines: { dsh: pkg.engines.dsh },
    }],
  }],
};
const parsed = parseMarketIndex(index, indexUrl);
await writeFile('marketplace/index.json', JSON.stringify(index, null, 2) + '\n');
console.log(JSON.stringify({ indexUrl, install: marketInstallTarget(parsed.plugins[0].name, parsed.plugins[0].versions[0]) }, null, 2));
