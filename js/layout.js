// 슬라이드 설계도(내용) → 좌표가 붙은 요소 목록으로 배치. 단위는 인치(16:9 = 13.333 x 7.5)
const SLIDE_W = 13.333, SLIDE_H = 7.5;
const AREA = { x: 0.6, y: 1.25, w: 12.13, bottom: 7.05 };
const BLOCK_TYPES = ['heading', 'bullets', 'table', 'process', 'note', 'conclusion'];

let _uid = 0;
const newId = () => 'e' + Date.now().toString(36) + (_uid++);

const plain = s => String(s).replace(/\*\*/g, '');
// 한글은 글자 폭 ≈ 글자 크기, 영문·숫자는 그 절반 정도로 어림
function textWidthIn(s, pt) {
  let u = 0;
  for (const ch of plain(s)) u += /[ᄀ-￿]/.test(ch) ? 1 : 0.55;
  return u * pt / 72;
}
function lineCount(s, pt, wIn) {
  return String(s).split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(textWidthIn(line, pt) / Math.max(wIn - 0.15, 0.3))), 0);
}
const lineH = pt => pt * 1.25 / 72;

// LLM 응답을 믿지 않고 모양을 강제로 맞춤
function normalize(raw) {
  const str = v => (v == null ? '' : String(v)).trim();
  const slides = (Array.isArray(raw && raw.slides) ? raw.slides : []).map(s => {
    const blocks = (Array.isArray(s && s.blocks) ? s.blocks : []).filter(b => b && BLOCK_TYPES.includes(b.type)).map(b => {
      if (b.type === 'bullets') {
        const items = (Array.isArray(b.items) ? b.items : []).map(it => typeof it === 'string' ? { text: str(it), level: 1 } : { text: str(it && it.text), level: (it && it.level) == 2 ? 2 : 1 }).filter(it => it.text);
        return { type: 'bullets', items };
      }
      if (b.type === 'table') {
        const header = (Array.isArray(b.header) ? b.header : []).map(str);
        let rows = (Array.isArray(b.rows) ? b.rows : []).filter(Array.isArray).map(r => r.map(str));
        const cols = Math.max(header.length, ...rows.map(r => r.length), 1);
        const pad = r => r.concat(Array(cols - r.length).fill('')).slice(0, cols);
        return { type: 'table', header: pad(header), rows: rows.map(pad) };
      }
      if (b.type === 'process') return { type: 'process', steps: (Array.isArray(b.steps) ? b.steps : []).map(str).filter(Boolean) };
      return { type: b.type, text: str(b.text) };
    }).filter(b => (b.items ? b.items.length : b.steps ? b.steps.length : b.rows ? true : b.text));
    return { title: str(s && s.title), blocks };
  }).filter(s => s.title || s.blocks.length);
  return { omitted: !!(raw && raw.omitted), slides };
}

function colWidths(header, rows, w) {
  const weights = header.map((h, j) => Math.max(2, Math.sqrt(Math.max(...[h, ...rows.map(r => r[j])].map(c => plain(c).length)))));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map(x => w * x / sum);
}

function tableHeight(el) {
  const rowH = r => Math.max(...r.map((c, j) => lineCount(c, el.fontSize, el.colW[j]))) * lineH(el.fontSize) + 0.14;
  return [el.header, ...el.rows].reduce((h, r) => h + rowH(r), 0);
}

function layoutSlide(s, f) {
  const els = [{ id: newId(), type: 'title', x: 0, y: 0, w: SLIDE_W, h: 1.0, fontSize: 26, text: s.title }];
  let y = AREA.y;
  const { x, w } = AREA;
  for (const b of s.blocks) {
    let el;
    if (b.type === 'heading') {
      const pt = 18 * f;
      el = { type: 'heading', fontSize: pt, text: b.text, h: lineCount(b.text, pt, w - 0.4) * lineH(pt) + 0.08 };
    } else if (b.type === 'bullets') {
      const pt = 14 * f;
      const h = b.items.reduce((a, it) => a + lineCount(it.text, pt, w - 0.35 * it.level) * lineH(pt) + 0.06, 0.1);
      el = { type: 'bullets', fontSize: pt, items: b.items, h };
    } else if (b.type === 'table') {
      el = { type: 'table', fontSize: 12 * f, header: b.header, rows: b.rows, colW: colWidths(b.header, b.rows, w) };
      el.h = tableHeight({ ...el });
    } else if (b.type === 'process') {
      // PowerPoint는 한글을 글자 단위로 줄바꿈 → 가장 긴 단어가 화살표 한 칸에 들어가도록 글자 크기 제한
      const h = 0.75 * Math.max(f, 0.8), n = b.steps.length;
      const usable = (w - 0.04 * (n - 1)) / n - h - 0.05;   // 화살표 글자 영역 ≈ 칸 너비 − 양쪽 홈(h/2씩)
      const fit = Math.min(...b.steps.flatMap(s => s.split(/\s+/)).map(tok => 14 * usable / Math.max(textWidthIn(tok, 14), 0.01)));
      el = { type: 'process', fontSize: Math.max(9, Math.min(14 * f, fit)), steps: b.steps, h };
    } else {
      const pt = (b.type === 'conclusion' ? 15 : 12) * f;
      el = { type: b.type, fontSize: pt, text: b.text, h: lineCount(b.text, pt, w - 0.4) * lineH(pt) + (b.type === 'conclusion' ? 0.32 : 0.24) };
    }
    Object.assign(el, { id: newId(), x, y, w });
    els.push(el);
    y += el.h + (b.type === 'heading' ? 0.06 : 0.2) * f;
  }
  return { elements: els, bottom: y };
}

// 내용이 적으면 글자를 키우고(최대 1.35배), 넘치면 줄여서 한 장에 맞춤
// ponytail: 0.6배까지만 줄이고 그래도 넘치면 그대로 둠(편집으로 해결). 자동 2단 배치는 필요해지면 추가
function layoutDeck(sem) {
  const slides = sem.slides.map(s => {
    let out;
    for (let f = 1.35; f >= 0.6; f = Math.round((f - 0.05) * 100) / 100) {
      out = layoutSlide(s, f);
      if (out.bottom <= AREA.bottom) break;
    }
    return { elements: out.elements };
  });
  return { omitted: sem.omitted, slides, edited: false };
}
