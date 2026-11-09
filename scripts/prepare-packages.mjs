import { Runtime } from '../src/runtime.mjs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const runtime = new Runtime(join(homedir(), '.dsh/latex-studio/runtime'));
const job = { signal: new AbortController().signal, log: console.log };
await runtime.tlmgr(['option', 'repository', 'https://mirrors.tuna.tsinghua.edu.cn/CTAN/systems/texlive/tlnet'], job);
await runtime.tlmgr(['update', '--self'], job);
await runtime.tlmgr(['install', 'ctex', 'fandol', 'xstring', 'acmart', 'algorithmicx', 'algorithms', 'lineno', 'preprint', 'environ', 'trimspaces', 'etoolbox', 'xcolor', 'geometry', 'eso-pic', 'silence', 'multirow', 'listings', 'appendix', 'threeparttable', 'footmisc', 'xurl', 'orcidlink', 'biblatex', 'biber'], job);
