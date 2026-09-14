const { test, expect } = require('@playwright/test');

/**
 * Step 1 of plans/completed/table-cell-writing.md: the quoting rule, on its own.
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

test('text that would not come back as the same text is quoted', async ({ page }) => {
  // The group that damages files, and it is narrower than it looks: what matters is the text
  // changing, not the value's type changing.
  const answers = await asks(page, ['007', '1.50', '+3', '.5', '1e3', '0x10']);
  for (const answer of answers) expect(answer.scalar).toBe(true);
});

test('null and ~ are quoted, because a cell would show nothing at all', async ({ page }) => {
  // The one coercion that does not show up as different text: it shows up as no text.
  const [word, tilde] = await asks(page, ['null', '~']);
  expect(word.scalar).toBe(true);
  expect(tilde.scalar).toBe(true);
});

test('a value that comes back printing as itself is left alone', async ({ page }) => {
  // A column's type lives in gypsum, not in the note, so the parser reads `42` as a number whatever
  // the column says — and prints it back as `42`. Quoting it would only put marks in the note that
  // nobody typed.
  const answers = await asks(page, ['42', '-1.5', '0', 'true', 'false']);
  for (const answer of answers) expect(answer.scalar).toBe(false);
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

test('every value comes back showing the same text, and the next key survives', async ({ page }) => {
  // The promise, stated as a test: what a cell would draw after the write is what was typed. The
  // value's own type may change — `42` is the number forty-two once it is in the file — and the
  // cell cannot tell, because it draws String(value).
  const texts = ['draft', '007', '1.50', 'true', 'null', 'due: friday', '- not a list', '#work',
                 '[draft]', '2026-03-01', 'a <b> c', "it's fine", 'she said "hi"', '42'];
  const results = await roundTrip(page, texts);

  results.forEach((result, i) => {
    expect(String(result.value), `${texts[i]} written as ${result.written}`).toBe(texts[i]);
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
  return cases.map(([text, type, shape]) => toYamlText(text, type, shape));
}, cases);

test('a key that is quoted today stays quoted', async ({ page }) => {
  // The same promise a flow list gets: the note goes on looking like the note it was, and an edit
  // does not quietly restyle a key beside the one being changed.
  const [wasQuoted, wasNot, quotedNumber] = await writes(page, [
    ['published', 'string', { quoted: true }],
    ['published', 'string', {}],
    ['43', 'number', { quoted: true }],
  ]);

  expect(wasQuoted).toBe(' "published"');
  expect(wasNot).toBe(' published');
  expect(quotedNumber).toBe(' "43"');
});

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
    ['en, fr', 'array', { form: 'flow' }],
    ['John Smith, Rae Chen', 'array', { form: 'block', itemPrefix: '- ' }],
    ['a, b', 'array', { form: 'block', itemPrefix: '\t- ' }],
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
    ['"Smith, John"', 'array', { form: 'flow' }],
    ['"Smith, John"', 'array', { form: 'block', itemPrefix: '- ' }],
    ['1, 2, 10', 'array', { form: 'flow' }],
    ['007, x', 'array', { form: 'flow' }],
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
  const [emptied, emptiedBlock] = await writes(page,
    [['', 'array', { form: 'flow' }], ['  ', 'array', { form: 'block', itemPrefix: '- ' }]]);

  // a bare key would open a nested map, which the parser prunes — and the column would vanish
  expect(emptied).toBe(' []');
  expect(emptiedBlock).toBe(' []');
});
