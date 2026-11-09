import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { foldable, ensureSyntaxTree } from '@codemirror/language';
import { highlightTree } from '@lezer/highlight';
import { latexExtensions, latexHighlight } from '../src/latex-editor.mjs';

test('LaTeX section folding respects hierarchy and excludes the next peer section', () => {
  const state = EditorState.create({ doc: String.raw`\begin{document}
\section{Introduction}
First paragraph.
\subsection{Background}
Background paragraph.
\section*{Methods}
Methods paragraph.
\end{document}`, extensions: latexExtensions });
  const section = state.doc.line(2), sub = state.doc.line(4), methods = state.doc.line(6);
  assert.deepEqual(foldable(state, section.from, section.to), { from: section.to, to: methods.from - 1 });
  assert.deepEqual(foldable(state, sub.from, sub.to), { from: sub.to, to: methods.from - 1 });
  assert.deepEqual(foldable(state, methods.from, methods.to), { from: methods.to, to: state.doc.line(8).from - 1 });
  const updated = state.update({ changes: { from: methods.from, insert: '\\subsection{More context}\nExtra paragraph.\n' } }).state;
  assert.equal(updated.sliceDoc(foldable(updated, section.from, section.to).from, foldable(updated, section.from, section.to).to), '\nFirst paragraph.\n\\subsection{Background}\nBackground paragraph.\n\\subsection{More context}\nExtra paragraph.');
});

test('nested environments fold while comments and verbatim headings are ignored', () => {
  const state = EditorState.create({ doc: String.raw`\section{Real section}
% \section{Commented heading}
\verb|\section{Literal heading}|
Escaped percent \% still text. % \section{Another comment}
\begin{figure}
\begin{center}
Figure content.
\end{center}
\end{figure}
\begin{verbatim}
\section{Code sample}
\end{verbatim}
\section{Next}
Next paragraph.`, extensions: latexExtensions });
  const line = n => state.doc.line(n);
  assert.deepEqual(foldable(state, line(5).from, line(5).to), { from: line(5).to, to: line(9).from - 1 });
  assert.deepEqual(foldable(state, line(6).from, line(6).to), { from: line(6).to, to: line(8).from - 1 });
  for (const n of [2, 3, 4, 11]) assert.equal(foldable(state, line(n).from, line(n).to), null);
  assert.equal(foldable(state, 0, line(1).to).to, line(13).from - 1);
});

test('real stream parser produces distinct heading, setup, reference, environment and math styles', () => {
  const state = EditorState.create({ doc: String.raw`\usepackage{amsmath}
\section{Introduction}
See \ref{fig:result} and \cite{paper}.
\begin{equation}
\frac{1}{2} + \alpha
\end{equation}
% a comment`, extensions: latexExtensions });
  const styled = new Map();
  highlightTree(ensureSyntaxTree(state, state.doc.length, 1000), latexHighlight, (from, to, classes) => styled.set(state.sliceDoc(from, to), classes));
  assert.equal(styled.get('\\section'), 'ls-syntax-heading');
  assert.equal(styled.get('\\usepackage'), 'ls-syntax-setup');
  assert.equal(styled.get('\\begin'), 'ls-syntax-environment');
  assert.equal(styled.get('\\ref'), 'ls-syntax-reference');
  assert.equal(styled.get('\\cite'), 'ls-syntax-reference');
  assert.equal(styled.get('\\frac'), 'ls-syntax-math');
  assert.equal(styled.get('% a comment'), 'ls-syntax-comment');
});
