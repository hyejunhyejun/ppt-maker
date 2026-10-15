// 미리보기 그리기: 1인치 = 96px, 1pt = 96/72px. 화면 크기는 바깥에서 transform으로 맞춤
const PX = 96;
const px = v => v * PX + 'px';
const fpx = pt => (pt * PX / 72).toFixed(1) + 'px';
const hex = c => '#' + c;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// **굵게** ↔ <b>
const md2html = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
function html2md(node) {
  let out = '';
  node.childNodes.forEach((n, i) => {
    if (n.nodeType === 3) { out += n.nodeValue; return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName;
    if (tag === 'BR') { out += '\n'; return; }
    const inner = html2md(n);
    if (tag === 'B' || tag === 'STRONG' || /bold|[6-9]00/.test(n.style.fontWeight)) out += inner.trim() ? `**${inner}**` : inner;
    else if (tag === 'DIV' || tag === 'P') out += (out && !out.endsWith('\n') ? '\n' : '') + inner;
    else out += inner;
  });
  return out.replace(/ /g, ' ').replace(/\*\*\*\*/g, '');
}

function renderSlide(slide, themeKey) {
  const t = THEMES[themeKey];
  const root = document.createElement('div');
  root.className = 'slide';
  for (const el of slide.elements) root.appendChild(renderEl(el, t));
  return root;
}

function renderEl(el, t) {
  const d = document.createElement('div');
  d.className = 'el el-' + el.type;
  d.dataset.id = el.id;
  Object.assign(d.style, { left: px(el.x), top: px(el.y), width: px(el.w), height: px(el.h), fontSize: fpx(el.fontSize) });
  const color = c => hex(el.color || c);
  const r = t.radius ? px(t.radius) : '0';

  if (el.type === 'title') {
    if (t.title.band === 'posco') d.style.backgroundImage = `url(${poscoBand()})`;
    d.innerHTML = `<div class="tx" data-edit style="color:${color(t.title.color)}">${md2html(el.text)}</div>`;
  } else if (el.type === 'heading') {
    const m = t.heading.marker;
    d.innerHTML = (m ? `<span class="mk mk-${m}" style="--ac:${hex(t.accent)}"></span>` : '') +
      `<div class="tx${m ? ' indent' : ''}" data-edit style="color:${color(t.heading.color)}">${md2html(el.text)}</div>`;
  } else if (el.type === 'bullets') {
    d.innerHTML = `<div class="tx" data-edit style="color:${color(t.text)}">` +
      el.items.map(it => `<div class="li" data-lvl="${it.level}">${md2html(it.text)}</div>`).join('') + '</div>';
  } else if (el.type === 'table') {
    const tt = t.table;
    const cell = (tag, c, j, head) => {
      const bg = head ? tt.head : (j === 0 && tt.firstCol) || 'FFFFFF';
      const st = `background:${hex(bg)};color:${head ? hex(tt.headText) : color(t.text)};border-color:${hex(tt.border)}${head || (j === 0 && tt.firstCol) ? ';font-weight:700' : ''}`;
      return `<${tag} data-edit style="${st}">${md2html(c)}</${tag}>`;
    };
    d.innerHTML = `<table><colgroup>${el.colW.map(w => `<col style="width:${px(w)}">`).join('')}</colgroup>` +
      `<tr>${el.header.map((c, j) => cell('th', c, j, true)).join('')}</tr>` +
      el.rows.map(row => `<tr>${row.map((c, j) => cell('td', c, j, false)).join('')}</tr>`).join('') + '</table>';
  } else if (el.type === 'process') {
    const notch = px(el.h / 2);
    d.innerHTML = el.steps.map((s, i) =>
      `<div class="step${i ? '' : ' first'}" style="--n:${notch};background:${hex(t.process.fill)};color:${color(t.process.text)}"><span data-edit>${md2html(s)}</span></div>`).join('');
  } else {
    // note / conclusion / text
    const box = el.type === 'text' ? { fill: null, text: t.text, line: null } : t[el.type];
    Object.assign(d.style, {
      background: box.fill ? hex(box.fill) : 'transparent',
      border: box.line ? `1px solid ${hex(box.line)}` : 'none', borderRadius: box.fill ? r : '0',
    });
    d.innerHTML = `<div class="tx" data-edit style="color:${color(box.text)}">${md2html(el.text)}</div>`;
  }
  d.insertAdjacentHTML('beforeend', '<span class="rz" title="크기 조절"></span>');
  return d;
}
