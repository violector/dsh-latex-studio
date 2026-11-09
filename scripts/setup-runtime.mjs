import { Runtime } from '../src/runtime.mjs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, copyFile } from 'node:fs/promises';
const root = join(homedir(), '.dsh/latex-studio/runtime');
await mkdir(root, { recursive: true });
await copyFile('.dev/downloads/TinyTeX-v2026.11.exe', join(root, 'TinyTeX-1-windows-v2026.11.exe'));
const runtime = new Runtime(root);
console.log(await runtime.install({ signal: new AbortController().signal, log: console.log }));
