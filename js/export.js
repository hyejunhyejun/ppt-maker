// 미리보기와 같은 좌표·색으로 편집 가능한 .pptx를 만듦 (PptxGenJS)
function runs(text, opts = {}) {
  const out = [];
  String(text).split('\n').forEach((line, li, lines) => {
    const parts = line.split(/\*\*(.+?)\*\*/);
    // 빈 조각이 있으면 PowerPoint가 파일을 손상으로 판단함(특히 표) → 빈 줄도 공백 하나로
    let segs = parts.map((p, i) => ({ text: p, options: { ...opts, ...(i % 2 ? { bold: true } : {}) } })).filter(s => s.text);
    if (!segs.length) segs = [{ text: ' ', options: { ...opts } }];
    if (li < lines.length - 1) segs[segs.length - 1].options.breakLine = true;
    out.push(...segs);
  });
  return out;
}

function buildPptx(deck, themeKey) {
  const t = THEMES[themeKey];
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  for (const s of deck.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    for (const el of s.elements) addEl(pptx, slide, el, t);
  }
  return pptx;
}

function addEl(pptx, slide, el, t) {
  const base = { fontFace: FONT, fontSize: el.fontSize, margin: 0, valign: 'top' };
  const color = c => el.color || c;
  const box = { x: el.x, y: el.y, w: el.w, h: el.h };

  if (el.type === 'title') {
    if (t.title.band === 'posco') slide.addImage({ data: poscoBand(), ...box });
    slide.addText(runs(el.text), { ...base, x: el.x + 0.5, y: el.y, w: el.w - 1, h: el.h, bold: true, color: color(t.title.color), valign: 'middle' });
  } else if (el.type === 'heading') {
    const m = t.heading.marker;
    const lh = el.fontSize * 1.25 / 72;
    if (m === 'circle') slide.addShape(pptx.ShapeType.ellipse, { x: el.x, y: el.y + (lh - 0.24) / 2, w: 0.24, h: 0.24, fill: { color: t.accent }, line: { color: 'BFD0F0', width: 2.5 } });
    if (m === 'bar') slide.addShape(pptx.ShapeType.rect, { x: el.x, y: el.y + lh * 0.15, w: 0.06, h: lh * 0.7, fill: { color: t.accent }, line: { type: 'none' } });
    const off = m === 'circle' ? 0.38 : m ? 0.21 : 0;
    slide.addText(runs(el.text), { ...base, ...box, x: el.x + off, w: el.w - off, bold: true, color: color(t.heading.color) });
  } else if (el.type === 'bullets') {
    const all = [];
    el.items.forEach((it, i) => {
      const rs = runs(it.text);
      rs[0].options = { ...rs[0].options, bullet: { code: it.level === 2 ? '2013' : '2022' }, indentLevel: it.level - 1, paraSpaceAfter: 3 };
      if (i < el.items.length - 1) rs[rs.length - 1].options.breakLine = true;
      all.push(...rs);
    });
    slide.addText(all, { ...base, ...box, color: color(t.text) });
  } else if (el.type === 'table') {
    const tt = t.table;
    const border = { type: 'solid', pt: 0.75, color: tt.border };
    const rows = [
      el.header.map(c => ({ text: runs(c), options: { bold: true, fill: { color: tt.head }, color: tt.headText, align: 'center' } })),
      ...el.rows.map(r => r.map((c, j) => ({ text: runs(c), options: j === 0 && tt.firstCol ? { bold: true, fill: { color: tt.firstCol } } : { fill: { color: 'FFFFFF' } } }))),
    ];
    slide.addTable(rows, { x: el.x, y: el.y, w: el.w, colW: el.colW, fontFace: FONT, fontSize: el.fontSize, color: color(t.text), border, valign: 'middle' });
  } else if (el.type === 'process') {
    const n = el.steps.length, gap = 0.04;
    const w = (el.w - gap * (n - 1)) / n;
    el.steps.forEach((s, i) => slide.addText(runs(s), {
      ...base, shape: i ? pptx.ShapeType.chevron : pptx.ShapeType.homePlate,
      x: el.x + i * (w + gap), y: el.y, w, h: el.h, fill: { color: t.process.fill }, line: { type: 'none' },
      color: color(t.process.text), align: 'center', valign: 'middle', bold: true,
    }));
  } else {
    const b = el.type === 'text' ? { fill: null, text: t.text, line: null } : t[el.type];
    slide.addText(runs(el.text), {
      ...base, ...box, color: color(b.text), bold: el.type === 'conclusion', margin: el.type === 'text' ? 0 : 9,
      valign: el.type === 'text' ? 'top' : 'middle',
      shape: t.radius && b.fill ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, rectRadius: t.radius ? t.radius : undefined,
      fill: b.fill ? { color: b.fill } : undefined, line: b.line ? { color: b.line, width: 1 } : { type: 'none' },
    });
  }
}
