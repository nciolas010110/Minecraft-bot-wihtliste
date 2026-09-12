import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkLines, selectPage } from '../utils/pagination.js';

test('teilt 46 Einträge in zwei Blöcke, ohne Einträge zu verlieren', () => {
  const lines = Array.from({ length: 46 }, (_, index) => `Eintrag ${index + 1}`);
  const blocks = chunkLines(lines);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].length, 25);
  assert.equal(blocks[1].length, 21);
  assert.equal(blocks.flat().length, 46);
});

test('bricht auch bei langen Zeilen vor dem Zeichenlimit um', () => {
  const lines = Array.from({ length: 10 }, () => 'x'.repeat(900));
  const blocks = chunkLines(lines);
  assert.ok(blocks.every((block) => block.join('\n').length <= 3500));
  assert.equal(blocks.flat().length, 10);
});

test('Seitenauswahl begrenzt auf gültige Seiten', () => {
  const blocks = chunkLines(Array.from({ length: 300 }, (_, index) => `Eintrag ${index + 1}`));
  const first = selectPage(blocks, 1);
  assert.equal(first.currentPage, 1);
  assert.equal(first.blocks.length, 4);
  assert.equal(selectPage(blocks, 99).currentPage, first.totalPages);
  assert.equal(selectPage(blocks, 0).currentPage, 1);
});
