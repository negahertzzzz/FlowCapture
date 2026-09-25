/**
 * Helpers for the "### Step N: Title" headings used by the generated documentation.
 * Kept free of React so they can be reused by the editor, the preview and the replay.
 */

const STEP_HEADING_RE = /^(\s{0,3}#{2,4}\s+)(Step|Passo)(\s*)(\d+)(\s*[:.])(.*)$/i;
const FENCE_RE = /^\s{0,3}(```|~~~)/;

type StepHeading = { line: number; word: string };

function findStepHeadings(lines: string[]): StepHeading[] {
  const headings: StepHeading[] = [];
  let inFence = false;
  lines.forEach((line, index) => {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const match = STEP_HEADING_RE.exec(line);
    if (match) headings.push({ line: index, word: match[2] });
  });
  return headings;
}

/** Rewrites every step heading so the numbers run 1, 2, 3… in document order. */
export function renumberSteps(markdown: string): string {
  const lines = markdown.split("\n");
  findStepHeadings(lines).forEach((heading, index) => {
    lines[heading.line] = lines[heading.line].replace(
      STEP_HEADING_RE,
      (_all, hashes, word, gap, _num, sep, rest) => `${hashes}${word}${gap || " "}${index + 1}${sep}${rest}`,
    );
  });
  return lines.join("\n");
}

export function countSteps(markdown: string): number {
  return findStepHeadings(markdown.split("\n")).length;
}

/**
 * Inserts a new step block at the start of the line following `cursor`, numbers it after the
 * steps that precede it and shifts the numbers of every following step.
 * Returns the new Markdown and the selection range covering the new step's title.
 */
export function insertStepAt(
  markdown: string,
  cursor: number,
  template: { title: string; body: string; fallbackWord: string },
): { markdown: string; selectionStart: number; selectionEnd: number } {
  const insertAt = stepInsertionOffset(markdown, cursor);

  const before = markdown.slice(0, insertAt);
  const after = markdown.slice(insertAt);
  const headingsBefore = findStepHeadings(before.split("\n"));
  const existing = findStepHeadings(markdown.split("\n"));
  const word = existing[0]?.word ?? template.fallbackWord;
  const stepNumber = headingsBefore.length + 1;

  const leading = !before.trim() || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const headingPrefix = `### ${word} ${stepNumber}: `;
  const block = `${leading}${headingPrefix}${template.title}\n${template.body}\n${after.trim() ? "\n" : ""}`;

  const combined = before + block + after;
  const renumbered = renumberSteps(combined);
  // Renumbering never changes text before the new heading, so offsets stay valid.
  const selectionStart = before.length + leading.length + headingPrefix.length;
  return {
    markdown: renumbered,
    selectionStart,
    selectionEnd: selectionStart + template.title.length,
  };
}

/**
 * Where a new step goes for a given cursor: right after the step the cursor is in (so the
 * current step keeps its text and images), before the first step when the cursor sits in the
 * introduction, or at the end of the document when there are no steps yet.
 */
function stepInsertionOffset(markdown: string, cursor: number): number {
  const lines = markdown.split("\n");
  const offsets: number[] = [];
  let acc = 0;
  for (const line of lines) {
    offsets.push(acc);
    acc += line.length + 1;
  }
  const safeCursor = Math.max(0, Math.min(cursor, markdown.length));
  let cursorLine = offsets.findIndex((start, i) => safeCursor < start + lines[i].length + 1);
  if (cursorLine === -1) cursorLine = lines.length - 1;

  const headings = findStepHeadings(lines);
  if (headings.length === 0) return markdown.length;
  if (cursorLine < headings[0].line) return offsets[headings[0].line];

  const SECTION_RE = /^\s{0,3}#{1,2}\s/;
  const fenced = new Set<number>();
  let inFence = false;
  lines.forEach((line, i) => {
    if (FENCE_RE.test(line)) inFence = !inFence;
    else if (inFence) fenced.add(i);
  });
  const isBoundary = (i: number) =>
    !fenced.has(i) && (STEP_HEADING_RE.test(lines[i]) || SECTION_RE.test(lines[i]));

  // Cursor in a section that follows the steps (e.g. "Expected result"): add after the last step.
  let anchor = cursorLine;
  const stepAtOrBefore = [...headings].reverse().find((h) => h.line <= cursorLine);
  if (stepAtOrBefore) {
    for (let i = stepAtOrBefore.line + 1; i <= cursorLine; i++) {
      if (!fenced.has(i) && SECTION_RE.test(lines[i])) {
        anchor = stepAtOrBefore.line;
        break;
      }
    }
  }

  for (let i = anchor + 1; i < lines.length; i++) {
    if (isBoundary(i)) return offsets[i];
  }
  return markdown.length;
}

/** Replaces the target of the first Markdown image on the given 1-based line. */
export function replaceImageOnLine(markdown: string, line: number, newTarget: string): string {
  const lines = markdown.split("\n");
  const index = line - 1;
  if (index < 0 || index >= lines.length) return markdown;
  lines[index] = lines[index].replace(/(!\[[^\]]*\]\()([^)]*)(\))/, (_all, open, _old, close) => `${open}${newTarget}${close}`);
  return lines.join("\n");
}
