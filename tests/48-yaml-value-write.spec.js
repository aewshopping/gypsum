const { test, expect } = require('@playwright/test');

/**
 * Step 1 of plans/table-cell-writing.md: the quoting rule, on its own.
 *
 * Pure text in, text out, so these are unit tests — no folder loaded, no table, no disk. The
 * round-trip block at the bottom is the one that matters: it writes a value the way the app would
 * and reads it back with the app's own parser, which is the only thing that can prove the rule is
 * right rather than merely plausible.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

/** needsQuoting() for each text, in a scalar and inside a flow list. */
const asks = (page, texts) => page.evaluate(async (texts) => {
  const { needsQuoting } = await import('/public/js/services/file-parsing/yaml-value-write.js');
  return texts.map(text => ({ scalar: needsQuoting(text), item: needsQuoting(text, true) }));
}, texts);

/**
 * Writes each value into a one-key block the way the app would, parses it back, and returns what
 * came out — the whole point of the rule, stated as a test.
 */
const roundTrip = (page, texts) => page.evaluate(async (texts) => {
  const { needsQuoting, quoteYaml } = await import('/public/js/services/file-parsing/yaml-value-write.js');
  const { parseYaml } = await import('/public/js/services/file-parsing/yaml-parse.js');
  return texts.map(text => {
    const written = needsQuoting(text) ? quoteYaml(text) : text;
    const errors = [];
    const data = parseYaml(`---\nnote: ${written}\nafter: kept\n---\n# Body\n`, errors);
    return { written, value: data.note, after: data.after, errors };
  });
}, texts);

test('the shapes that would break the block are quoted', async ({ page }) => {
  const [colon, colonEnd, dash, hash, quote, bracket, newline] =
    await asks(page, ['due: friday', 'trailing:', '- not a list', '#work', '"quoted"', '[draft]', 'two\nlines']);

  for (const answer of [colon, colonEnd, dash, hash, quote, bracket, newline]) {
    expect(answer.scalar).toBe(true);
    expect(answer.item).toBe(true);
  }
});

test('a value that would read back as something else is quoted', async ({ page }) => {
  // The group that damages files rather than the group everyone imagines: written plainly, every
  // one of these comes back as a different thing than was typed.
  const answers = await asks(page, ['007', '42', '-1.5', 'true', 'false', 'null', '~']);
  for (const answer of answers) expect(answer.scalar).toBe(true);
});

test('ordinary text is left alone, and so is a date', async ({ page }) => {
  const answers = await asks(page, ['draft', 'a b c', 'Jane Doe', '2026-03-01', '1 March 2026',
                                    'in progress', 'a <b> c', 'ratio 3:4']);
  for (const answer of answers) expect(answer.scalar).toBe(false);
});

test('a comma, a bracket or a quote is quoted inside a flow list only', async ({ page }) => {
  const [comma, close] = await asks(page, ['Smith, John', 'a] b']);

  // a block item runs to the end of its line, so none of these can end it early
  expect(comma.scalar).toBe(false);
  expect(close.scalar).toBe(false);
  expect(comma.item).toBe(true);
  expect(close.item).toBe(true);
});

test('an empty value is written as empty quotes rather than nothing', async ({ page }) => {
  // `note:` with nothing after it opens a nested map, which the parser prunes — the key would
  // survive in the file and vanish from the table, taking its column with it.
  const [empty] = await roundTrip(page, ['']);
  expect(empty.written).toBe('""');
  expect(empty.value).toBe('');
});

test('every value comes back as itself, and the next key survives', async ({ page }) => {
  const texts = ['draft', '007', 'true', 'null', 'due: friday', '- not a list', '#work',
                 '[draft]', '2026-03-01', 'a <b> c', "it's fine", 'she said "hi"', '42'];
  const results = await roundTrip(page, texts);

  results.forEach((result, i) => {
    expect(result.value, `${texts[i]} written as ${result.written}`).toBe(texts[i]);
    expect(result.after).toBe('kept');   // the block is intact, not just this one value
    expect(result.errors).toEqual([]);
  });
});

test('the quote character is the one the text does not use', async ({ page }) => {
  const written = await page.evaluate(async () => {
    const { quoteYaml } = await import('/public/js/services/file-parsing/yaml-value-write.js');
    return { plain: quoteYaml('a, b'), hasDouble: quoteYaml('she said "hi"'), hasSingle: quoteYaml("it's") };
  });

  expect(written.plain).toBe('"a, b"');
  expect(written.hasDouble).toBe(`'she said "hi"'`);   // double quotes would end the run early
  expect(written.hasSingle).toBe(`"it's"`);
});

test('a quoted flow item still reads back as one item', async ({ page }) => {
  const items = await page.evaluate(async () => {
    const { needsQuoting, quoteYaml } = await import('/public/js/services/file-parsing/yaml-value-write.js');
    const { splitFlowItems } = await import('/public/js/services/file-parsing/flow-list.js');
    const write = text => (needsQuoting(text, true) ? quoteYaml(text) : text);
    return splitFlowItems([write('Smith, John'), write('Jane Doe'), write('a", b')].join(', '));
  });

  expect(items).toEqual(['Smith, John', 'Jane Doe', 'a", b']);
});

// ---------------------------------------------------------------- what a type writes

/** toYamlText() for each case, as the text that goes after the colon. */
const writes = (page, cases) => page.evaluate(async (cases) => {
  const { toYamlText } = await import('/public/js/services/file-parsing/yaml-value-write.js');
  return cases.map(([text, type, form, prefix]) => toYamlText(text, type, form, prefix));
}, cases);

test('a number is written plainly, and text in a number column is not', async ({ page }) => {
  const [number, negative, words] = await writes(page,
    [['42', 'number'], ['-1.5', 'number'], ['about five', 'number']]);

  expect(number).toBe(' 42');
  expect(negative).toBe(' -1.5');
  expect(words).toBe(' about five');
});

test('a date is written as it was typed, whatever shape that is', async ({ page }) => {
  const [iso, words] = await writes(page, [['2026-03-01', 'date'], ['1 March 2026', 'date']]);

  expect(iso).toBe(' 2026-03-01');
  expect(words).toBe(' 1 March 2026');
});

test('a list keeps the form and the indentation the file already uses', async ({ page }) => {
  const [flow, block, tabbed, fresh] = await writes(page, [
    ['en, fr', 'array', 'flow'],
    ['John Smith, Rae Chen', 'array', 'block', '- '],
    ['a, b', 'array', 'block', '\t- '],
    ['a, b', 'array'],
  ]);

  expect(flow).toBe(' [en, fr]');
  expect(block).toBe('\n- John Smith\n- Rae Chen');
  expect(tabbed).toBe('\n\t- a\n\t- b');
  // two spaces is the one style this chooses, and only where there is nothing to copy
  expect(fresh).toBe('\n  - a\n  - b');
});

test('an item is quoted for the form it lands in, and for its own text', async ({ page }) => {
  const [flow, block, numbers, padded] = await writes(page, [
    // as the cell shows a one-item list whose item holds a comma
    ['"Smith, John"', 'array', 'flow'],
    ['"Smith, John"', 'array', 'block', '- '],
    ['1, 2, 10', 'array', 'flow'],
    ['007, x', 'array', 'flow'],
  ]);

  // the comma ends an item in flow form and cannot in block form, where the line does
  expect(flow).toBe(' ["Smith, John"]');
  expect(block).toBe('\n- Smith, John');

  // a list is text in the editor and values in the file, so numbers stay numbers — but 007 would
  // come back as 7, which is not what anyone typed
  expect(numbers).toBe(' [1, 2, 10]');
  expect(padded).toBe(' ["007", x]');
});

test('a list with nothing left in it is written as an empty list', async ({ page }) => {
  const [emptied, emptiedBlock] = await writes(page, [['', 'array', 'flow'], ['  ', 'array', 'block', '- ']]);

  // a bare key would open a nested map, which the parser prunes — and the column would vanish
  expect(emptied).toBe(' []');
  expect(emptiedBlock).toBe(' []');
});
