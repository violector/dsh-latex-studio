import { Studio } from '../src/core.mjs';
import { writeFile } from 'node:fs/promises';
const studio = new Studio();
const project = await studio.execute({ action: 'create', templateId: 'article', title: 'LaTeX Studio Layout and Editor Validation' });
const source = String.raw`\documentclass{article}
\usepackage{amsmath,graphicx}
\title{Layout and Editor Validation}
\author{LaTeX Studio Test}
\begin{document}
\maketitle
% Comments should be visually distinct.
\section{Introduction}
This paragraph can be copied, deleted, or revised with AI.
The surrounding text must remain unchanged.
\subsection{Background}
This subsection belongs to the introduction.
\section{Methods}
See Equation~\ref{eq:demo} for the mathematical model.
\begin{equation}
  y = \frac{1}{2} + \alpha x
  \label{eq:demo}
\end{equation}
\begin{figure}[ht]
  \centering
  \fbox{A figure placeholder}
  \caption{A foldable figure environment.}
\end{figure}
\section{Results}
This is a layout validation document with no research claims.
\end{document}
`;
await studio.execute({ action: 'write', projectId: project.id, path: 'main.tex', content: source });
await studio.execute({ action: 'activate', projectId: project.id });
const job = await studio.execute({ action: 'compile', projectId: project.id });
let result;
do { await new Promise(resolve => setTimeout(resolve, 1000)); result = await studio.execute({ action: 'job', jobId: job.id }); } while (result.status === 'running');
if (!result.result?.success) throw new Error(JSON.stringify(result));
await writeFile('test-output/editor-project.json', JSON.stringify({ id: project.id, directory: project.directory, source }, null, 2));
console.log(JSON.stringify({ id: project.id, compiled: true }));
