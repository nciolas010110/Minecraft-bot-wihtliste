/*
  Seiten-Hilfsmodul für lange Discord-Listen.
  - Discord erlaubt pro Embed 4096 Zeichen und pro Nachricht 6000 Zeichen.
  - Deshalb werden Zeilen in Blöcke aufgeteilt und auf mehrere Embeds verteilt.
*/
export const MAX_LINES_PER_BLOCK = 25;
export const MAX_CHARS_PER_BLOCK = 3500;
export const BLOCKS_PER_PAGE = 4;

// Teilt Zeilen in Blöcke auf, die jeweils in ein Embed passen.
export function chunkLines(lines, { maxLines = MAX_LINES_PER_BLOCK, maxChars = MAX_CHARS_PER_BLOCK } = {}) {
  const blocks = [];
  let current = [];
  let currentChars = 0;

  for (const line of lines) {
    const lineLength = line.length + 1;
    if (current.length >= maxLines || (current.length && currentChars + lineLength > maxChars)) {
      blocks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(line);
    currentChars += lineLength;
  }

  if (current.length) blocks.push(current);
  return blocks;
}

// Wählt die Blöcke einer Seite aus und liefert Metadaten für die Fußzeile.
export function selectPage(blocks, page = 1, blocksPerPage = BLOCKS_PER_PAGE) {
  const totalPages = Math.max(1, Math.ceil(blocks.length / blocksPerPage));
  const currentPage = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages);
  const start = (currentPage - 1) * blocksPerPage;
  return {
    blocks: blocks.slice(start, start + blocksPerPage),
    currentPage,
    totalPages
  };
}
