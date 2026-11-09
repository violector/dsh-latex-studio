import { escapeTex } from './latex.mjs';

export function snippet(kind, options = {}) {
  options = { ...options, caption: options.caption ? escapeTex(options.caption) : '' };
  if (kind === 'equation') return { packages: ['amsmath', 'amssymb'], tex: `\n\\begin{equation}\n  ${options.formula || 'E = mc^2'}\n  \\label{eq:result}\n\\end{equation}\n` };
  if (kind === 'figure') {
    const environment = options.wide ? 'figure*' : 'figure';
    return { packages: ['graphicx'], tex: `\n\\begin{${environment}}[tbp]\n  \\centering\n  \\includegraphics[width=${options.width || '0.9'}\\linewidth]{\\detokenize{${options.path || 'figures/result.png'}}}\n  \\caption{${options.caption || 'Describe this figure.'}}\n  \\label{fig:result}\n\\end{${environment}}\n` };
  }
  if (kind === 'table') {
    const columns = Math.min(8, Math.max(2, Number(options.columns) || 3));
    const rows = Math.min(20, Math.max(1, Number(options.rows) || 3));
    const header = Array.from({ length: columns }, (_, i) => i ? `Metric ${i}` : 'Method').join(' & ');
    const data = Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, c) => c ? '--' : `Method ${r + 1}`).join(' & ') + ' \\\\').join('\n');
    return { packages: ['booktabs'], tex: `\n\\begin{table}[tbp]\n\\centering\n\\caption{${options.caption || 'Comparison of methods.'}}\n\\label{tab:results}\n\\begin{tabular}{l${'r'.repeat(columns - 1)}}\n\\toprule\n${header} \\\\\n\\midrule\n${data}\n\\bottomrule\n\\end{tabular}\n\\end{table}\n` };
  }
  const old = options.legacy;
  return { packages: ['algorithm', old ? 'algorithmic' : 'algpseudocode'], tex: `\n\\begin{algorithm}[tbp]\n\\caption{${options.caption || 'Iterative optimization'}}\n\\label{alg:method}\n\\begin{algorithmic}[1]\n\\${old ? 'REQUIRE' : 'Require'} Data $X$, iteration limit $T$\n\\${old ? 'STATE' : 'State'} Initialize parameters $\\theta$\n\\${old ? 'FOR' : 'For'}{$t=1,\\ldots,T$}\n  \\${old ? 'STATE' : 'State'} $\\theta \\gets \\theta - \\eta \\nabla_\\theta \\mathcal{L}(\\theta;X)$\n\\${old ? 'ENDFOR' : 'EndFor'}\n\\${old ? 'RETURN' : 'State \\Return'} $\\theta$\n\\end{algorithmic}\n\\end{algorithm}\n` };
}

export function insertSnippet(document, position, generated) {
  const begin = document.indexOf('\\begin{document}');
  const end = document.indexOf('\\end{document}');
  if (begin >= 0 && (position < begin + 16 || position > end)) position = end;
  const labels = new Set([...document.matchAll(/\\label\{([^}]+)\}/g)].map(match => match[1]));
  const tex = generated.tex.replace(/\\label\{([^}]+)\}/g, (_, base) => {
    let label = base, number = 2;
    while (labels.has(label)) label = `${base}-${number++}`;
    labels.add(label);
    return `\\label{${label}}`;
  });
  let source = document.slice(0, position) + tex + document.slice(position);
  return addPackages(source, generated.packages);
}

export function addPackages(document, packages) {
  const declared = [...document.matchAll(/\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{([^}]+)\}/g)].flatMap(m => m[1].split(',').map(p => p.trim()));
  const missing = packages.filter(p => !declared.includes(p));
  return missing.length ? document.replace(/\\begin\{document\}/, `\\usepackage{${missing.join(',')}}\n\\begin{document}`) : document;
}
