import { StateField } from '@codemirror/state';
import { StreamLanguage, HighlightStyle, syntaxHighlighting, foldService } from '@codemirror/language';
import { Tag, tags } from '@lezer/highlight';
import { stex } from '@codemirror/legacy-modes/mode/stex';

const headingLevels = { part: 0, chapter: 1, section: 2, subsection: 3, subsubsection: 4, paragraph: 5, subparagraph: 6 };
const heading = Tag.define(), environment = Tag.define(), reference = Tag.define(), setup = Tag.define(), math = Tag.define();
const referenceCommand = /^(?:[A-Za-z]*cite[A-Za-z]*|ref|eqref|autoref|cref|Cref|pageref|label|bibitem|bibliography|bibliographystyle)$/;
const setupCommand = /^(?:documentclass|usepackage|RequirePackage|newcommand|renewcommand|providecommand|newenvironment|def|input|include|includegraphics|graphicspath|geometry)$/;
const mathCommand = /^(?:frac|dfrac|tfrac|sqrt|sum|prod|int|iint|lim|log|exp|sin|cos|tan|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|sigma|phi|psi|omega|pi|nabla|partial|infty|times|cdot|leq|geq|equiv|approx|mathbb|mathbf|mathrm|mathcal|left|right)$/;

const language = StreamLanguage.define({
  ...stex,
  tokenTable: { latexHeading: heading, latexEnvironment: environment, latexReference: reference, latexSetup: setup, latexMath: math },
  token(stream, state) {
    const type = stex.token(stream, state);
    if (type === 'tag') {
      const command = /^\\([A-Za-z@]+)$/.exec(stream.current())?.[1];
      if (command in headingLevels) return 'latexHeading';
      if (command === 'begin' || command === 'end') return 'latexEnvironment';
      if (referenceCommand.test(command)) return 'latexReference';
      if (setupCommand.test(command)) return 'latexSetup';
      if (mathCommand.test(command)) return 'latexMath';
    }
    if (type === 'atom') {
      const command = state.cmdState.findLast(item => item.name !== 'DEFAULT')?.name;
      if (referenceCommand.test(command)) return 'latexReference';
      if (setupCommand.test(command)) return 'latexSetup';
      if (command === 'begin' || command === 'end') return 'latexEnvironment';
    }
    return type;
  },
});

export const latexHighlight = HighlightStyle.define([
  { tag: heading, class: 'ls-syntax-heading' },
  { tag: environment, class: 'ls-syntax-environment' },
  { tag: reference, class: 'ls-syntax-reference' },
  { tag: setup, class: 'ls-syntax-setup' },
  { tag: [math, tags.keyword, tags.special(tags.variableName)], class: 'ls-syntax-math' },
  { tag: tags.tagName, class: 'ls-syntax-command' },
  { tag: [tags.atom, tags.string, tags.number], class: 'ls-syntax-value' },
  { tag: tags.bracket, class: 'ls-syntax-bracket' },
  { tag: tags.comment, class: 'ls-syntax-comment' },
  { tag: tags.invalid, class: 'ls-syntax-error' },
]);

const foldIndex = StateField.define({
  create: state => indexFolds(state.doc),
  update: (value, transaction) => transaction.docChanged ? indexFolds(transaction.newDoc) : value,
});

export const latexExtensions = [language, syntaxHighlighting(latexHighlight), foldIndex, foldService.of((state, start) => state.field(foldIndex).get(start) || null)];

function indexFolds(doc) {
  const ranges = new Map(), headings = [], environments = [];
  let literal = null;
  const close = (entry, to) => { if (to > entry.from) ranges.set(entry.line, { from: entry.from, to }); };
  for (let number = 1; number <= doc.lines; number++) {
    const line = doc.line(number);
    const code = structuralText(line.text);
    for (const match of code.matchAll(/(?<!\\)\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph|begin|end)(?![A-Za-z@])\*?\s*(?:\{([^}]+)\})?/g)) {
      const [, command, name] = match;
      if (literal && !(command === 'end' && name === literal)) continue;
      if (command in headingLevels) {
        const level = headingLevels[command];
        while (headings.length && headings.at(-1).level >= level) close(headings.pop(), line.from - 1);
        headings.push({ line: line.from, from: line.to, level });
      } else if (command === 'begin' && name) {
        environments.push({ line: line.from, from: line.to, name });
        if (/^(?:verbatim\*?|lstlisting|minted|comment)$/.test(name)) literal = name;
      } else if (command === 'end' && name) {
        if (name === 'document') while (headings.length) close(headings.pop(), line.from - 1);
        const at = environments.findLastIndex(entry => entry.name === name);
        if (at >= 0) close(environments.splice(at)[0], line.from - 1);
        if (literal === name) literal = null;
      }
    }
  }
  while (headings.length) close(headings.pop(), doc.length);
  return ranges;
}

function structuralText(text) {
  const withoutVerb = text.replace(/\\verb\*?([^A-Za-z\s])[^\n]*?\1/g, match => ' '.repeat(match.length));
  let slashes = 0;
  for (let index = 0; index < withoutVerb.length; index++) {
    const char = withoutVerb[index];
    if (char === '%' && slashes % 2 === 0) return withoutVerb.slice(0, index);
    slashes = char === '\\' ? slashes + 1 : 0;
  }
  return withoutVerb;
}
