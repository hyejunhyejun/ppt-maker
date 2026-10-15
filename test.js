// 배치 로직 점검: node test.js
const fs = require('fs'), vm = require('vm');
globalThis.assert = require('assert');
vm.runInThisContext(fs.readFileSync(__dirname + '/js/layout.js', 'utf8') + `
// LLM이 엉성하게 답해도 모양이 맞춰지는지
const sem = normalize({ omitted: 1, slides: [
  { title: '비교', blocks: [
    { type: 'table', header: ['구분', 'A'], rows: [['x', 'y', 'z'], 'bad'] },
    { type: 'bullets', items: ['문자열 항목', { text: '하위', level: 2 }, { text: '' }] },
    { type: 'unknown', text: 'x' }, { type: 'note', text: '' },
  ] },
  null,
] });
assert.strictEqual(sem.slides.length, 1);
assert.strictEqual(sem.omitted, true);
const [tbl, bl] = sem.slides[0].blocks;
assert.deepStrictEqual(tbl.header, ['구분', 'A', '']);
assert.strictEqual(tbl.rows.length, 1);
assert.deepStrictEqual(bl.items, [{ text: '문자열 항목', level: 1 }, { text: '하위', level: 2 }]);
assert.strictEqual(sem.slides[0].blocks.length, 2);

// 배치: 표 열 너비 합 = 표 너비, 넘치는 슬라이드는 글자를 줄여 영역 안에 들어감
const deck = layoutDeck(sem);
const t = deck.slides[0].elements.find(e => e.type === 'table');
assert(Math.abs(t.colW.reduce((a, b) => a + b, 0) - t.w) < 1e-6);
const long = { title: '긴 내용', blocks: Array.from({ length: 9 }, (_, i) => ({ type: 'bullets', items: [{ text: '가나다라마바사아자차카타파하 '.repeat(8) + i, level: 1 }] })) };
const els = layoutDeck({ slides: [long] }).slides[0].elements;
const last = els[els.length - 1];
assert(last.y + last.h <= AREA.bottom + 0.3, '넘침: ' + (last.y + last.h));
assert(els[1].fontSize < 14, '글자가 줄어야 함');
console.log('OK');
`);
