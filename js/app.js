// 화면 연결: 입력 → 생성 → 미리보기 편집 → 다운로드
const $ = s => document.querySelector(s);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { } },
};

const state = {
  mode: 'auto', theme: store.get('theme') || 'posco',
  decks: {}, hist: {}, srcUsed: '',   // 장수별 결과·되돌리기 기록 따로 보관
  cur: 0, sel: null, editing: false, cell: null, scale: 1,
};
const deck = () => state.decks[state.mode];
const slide = () => deck() && deck().slides[state.cur];
const selEl = () => slide() && slide().elements.find(e => e.id === state.sel);

// ---------- 붙여넣기: 클립보드 HTML(표 구조)을 마크다운으로 ----------
function htmlToMd(html) {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const kids = (n, d) => [...n.childNodes].map(c => md(c, d)).join('');
  const cellText = c => kids(c, 0).replace(/\s*\n+\s*/g, ' ').replace(/\|/g, '/').trim();
  function md(n, d = 0) {
    if (n.nodeType === 3) return n.nodeValue.replace(/\s+/g, ' ');
    if (n.nodeType !== 1) return '';
    const tag = n.tagName;
    if (/^(STYLE|SCRIPT|META|TITLE)$/.test(tag)) return '';
    if (tag === 'BR') return '\n';
    if (tag === 'B' || tag === 'STRONG') { const t = kids(n, d).trim(); return t ? `**${t}**` : ''; }
    if (/^H[1-6]$/.test(tag)) return `\n\n${'#'.repeat(+tag[1])} ${kids(n, d).trim()}\n\n`;
    if (tag === 'TABLE') {
      const rows = [...n.rows].map(tr => [...tr.cells].map(cellText));
      if (!rows.length) return '';
      const line = r => `| ${r.join(' | ')} |`;
      return `\n\n${line(rows[0])}\n|${rows[0].map(() => '---').join('|')}|\n${rows.slice(1).map(line).join('\n')}\n\n`;
    }
    if (tag === 'UL' || tag === 'OL') {
      const items = [...n.children].filter(c => c.tagName === 'LI');
      return '\n' + items.map((li, i) => '  '.repeat(d) + (tag === 'OL' ? `${i + 1}. ` : '- ') + kids(li, d + 1).trim()).join('\n') + '\n';
    }
    if (/^(P|DIV|SECTION|ARTICLE|BLOCKQUOTE|PRE|LI)$/.test(tag)) return '\n' + kids(n, d) + '\n';
    return kids(n, d);
  }
  return md(body).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

$('#src').addEventListener('paste', e => {
  const html = e.clipboardData.getData('text/html');
  if (!html || !/<(table|h[1-6]|li|strong|b)\b/i.test(html)) return;   // 서식 없는 글자는 그대로 붙여넣기
  e.preventDefault();
  const ta = e.target;
  ta.setRangeText(htmlToMd(html), ta.selectionStart, ta.selectionEnd, 'end');
});
document.querySelectorAll('[data-sample]').forEach(b => b.onclick = () => { $('#src').value = SAMPLES[b.dataset.sample]; });

// ---------- 상태 표시 ----------
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 3500);
}
function status(msg, kind = '') { const s = $('#status'); s.textContent = msg; s.className = 'status ' + kind; }

// ---------- 설정 ----------
const dlg = $('#dlg-settings');
const getModel = () => store.get('gemini_model') || 'gemini-flash-latest';
$('#btn-settings').onclick = () => { $('#in-key').value = store.get('gemini_key') || ''; $('#in-model').value = getModel(); dlg.showModal(); };
dlg.addEventListener('close', () => {
  if (dlg.returnValue !== 'save') return;
  store.set('gemini_key', $('#in-key').value.trim());
  store.set('gemini_model', $('#in-model').value.trim() || 'gemini-flash-latest');
  toast('저장했습니다.');
});

// ---------- 생성 ----------
async function generate() {
  const src = $('#src').value.trim();
  if (!src) return toast('먼저 답변을 붙여넣어 주세요.');
  const key = store.get('gemini_key');
  if (!key) { toast('설정에서 Gemini API 키를 먼저 넣어 주세요.'); return $('#btn-settings').click(); }
  if (src !== state.srcUsed) { state.decks = {}; state.hist = {}; state.srcUsed = src; }
  const mode = state.mode;
  $('#btn-gen').disabled = true;
  status(`${modeLabel(mode)} 구성 중… (20~40초)`, 'busy');
  try {
    const sem = normalize(await callLLM(buildPrompt(src, mode), { key, model: getModel() }));
    if (!sem.slides.length) throw new Error('슬라이드가 비어 있습니다. 다시 시도해 주세요.');
    state.decks[mode] = layoutDeck(sem);
    status(`${modeLabel(mode)} 완료 · ${sem.slides.length}장`);
    if (state.mode === mode) { state.cur = 0; state.sel = null; }
  } catch (err) {
    status(err.message, 'err');
  } finally {
    $('#btn-gen').disabled = false;
    render();
  }
}
const modeLabel = m => m === 'auto' ? '추천 장수' : m + '장';
$('#btn-gen').onclick = generate;

document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
  if (b.dataset.mode === state.mode) return;
  finishEdit();
  if (deck() && deck().edited) toast('수정한 내용은 이전 장수 버전에만 남아 있습니다.');
  state.mode = b.dataset.mode; state.cur = 0; state.sel = null;
  render();
  if (!deck() && $('#src').value.trim() && state.srcUsed) generate();
});
document.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => {
  state.theme = b.dataset.theme; store.set('theme', state.theme); render();
});

// ---------- 그리기 ----------
function render() {
  document.querySelectorAll('[data-mode]').forEach(b => {
    b.classList.toggle('on', b.dataset.mode === state.mode);
    b.classList.toggle('has', !!state.decks[b.dataset.mode]);
  });
  document.querySelectorAll('[data-theme]').forEach(b => b.classList.toggle('on', b.dataset.theme === state.theme));
  const d = deck();
  $('#banner').hidden = !(d && d.omitted);
  renderThumbs(); renderStage(); renderToolbar();
}

function renderThumbs() {
  const ol = $('#thumbs'); ol.innerHTML = '';
  if (!deck()) return;
  deck().slides.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = i === state.cur ? 'on' : '';
    const clip = document.createElement('div'); clip.className = 'clip';
    clip.appendChild(renderSlide(s, state.theme));
    li.appendChild(clip);
    li.onclick = () => { finishEdit(); state.cur = i; state.sel = null; render(); };
    ol.appendChild(li);
  });
}

function renderStage() {
  const stage = $('#stage');
  if (!slide()) { if (!stage.querySelector('.empty')) stage.innerHTML = '<p class="empty">왼쪽에 답변을 붙여넣고 <b>PPT 생성</b>을 누르세요.</p>'; return; }
  const holder = document.createElement('div'); holder.className = 'holder';
  const s = renderSlide(slide(), state.theme);
  holder.appendChild(s);
  stage.innerHTML = ''; stage.appendChild(holder);
  fitStage();
  if (state.sel) { const el = s.querySelector(`[data-id="${state.sel}"]`); el ? el.classList.add('sel') : state.sel = null; }
}
function fitStage() {
  const stage = $('#stage'), holder = stage.querySelector('.holder');
  if (!holder) return;
  state.scale = Math.min((stage.clientWidth - 32) / 1280, (stage.clientHeight - 32) / 720);
  holder.style.width = 1280 * state.scale + 'px'; holder.style.height = 720 * state.scale + 'px';
  holder.firstChild.style.transform = `scale(${state.scale})`;
}
new ResizeObserver(fitStage).observe($('#stage'));

function renderToolbar() {
  const tb = $('#toolbar'), el = selEl();
  tb.classList.toggle('no-deck', !deck());
  tb.classList.toggle('has-sel', !!el);
  tb.classList.toggle('is-table', !!el && el.type === 'table');
  tb.classList.toggle('is-process', !!el && el.type === 'process');
  $('#swatches').innerHTML = THEMES[state.theme].palette.map(c => `<button class="sw" data-act="color" data-color="${c}" style="background:#${c}" title="글자색"></button>`).join('');
  tb.querySelector('[data-act="undo"]').disabled = !(state.hist[state.mode] || []).length;
}

// ---------- 변경·되돌리기 ----------
function commit(fn) {
  const h = (state.hist[state.mode] ||= []);
  h.push(JSON.stringify({ d: deck(), cur: state.cur }));
  if (h.length > 50) h.shift();
  fn(deck());
  deck().edited = true;
  render();
}
function undo() {
  const h = state.hist[state.mode];
  if (!h || !h.length) return;
  const { d, cur } = JSON.parse(h.pop());
  state.decks[state.mode] = d; state.cur = Math.min(cur, d.slides.length - 1); state.sel = null;
  render();
}

// ---------- 선택·이동·크기 조절 ----------
$('#stage').addEventListener('pointerdown', e => {
  let div = e.target.closest('.el');
  if (state.editing && div && div.dataset.id === state.sel) return;   // 글자 편집 중에는 그대로 둠
  if (state.editing) {   // 편집을 마치면 다시 그려지므로 새 요소를 다시 찾음
    const id = div && div.dataset.id;
    finishEdit();
    div = id && $('#stage').querySelector(`.el[data-id="${id}"]`);
  }
  if (!div) { if (state.sel) { state.sel = null; render(); } return; }
  e.preventDefault();
  if (state.sel !== div.dataset.id) {
    document.querySelectorAll('.stage .el.sel').forEach(x => x.classList.remove('sel'));
    state.sel = div.dataset.id; div.classList.add('sel'); renderToolbar();
  }
  const el = selEl(), resize = e.target.classList.contains('rz');
  const start = { x: e.clientX, y: e.clientY, ex: el.x, ey: el.y, ew: el.w, eh: el.h };
  let moved = false;
  const toIn = v => v / state.scale / PX;
  const snap = v => Math.round(v * 20) / 20;
  const move = ev => {
    const dx = toIn(ev.clientX - start.x), dy = toIn(ev.clientY - start.y);
    if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 3) return;
    moved = true;
    if (resize) { div.style.width = px(Math.max(0.4, snap(start.ew + dx))); div.style.height = px(Math.max(0.25, snap(start.eh + dy))); }
    else { div.style.left = px(snap(start.ex + dx)); div.style.top = px(snap(start.ey + dy)); }
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up);
    if (!moved) return;
    const r = { x: parseFloat(div.style.left) / PX, y: parseFloat(div.style.top) / PX, w: parseFloat(div.style.width) / PX, h: parseFloat(div.style.height) / PX };
    commit(() => {
      if (el.type === 'table' && resize) el.colW = el.colW.map(c => c * r.w / el.w);
      Object.assign(el, r);
    });
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
});

// ---------- 글자 편집 (더블클릭) ----------
$('#stage').addEventListener('dblclick', e => {
  const div = e.target.closest('.el');
  if (!div || state.editing) return;
  state.sel = div.dataset.id; state.editing = true; state.cell = null;
  div.classList.add('sel', 'editing');
  div.querySelectorAll('[data-edit]').forEach(x => x.contentEditable = 'true');
  const target = e.target.closest('[data-edit]') || div.querySelector('[data-edit]');
  target.focus();
  // 더블클릭한 위치에 커서
  const r = document.caretRangeFromPoint && document.caretRangeFromPoint(e.clientX, e.clientY);
  if (r) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
});
$('#stage').addEventListener('focusin', e => {
  const c = e.target.closest('th,td');
  state.cell = c ? { r: c.parentElement.rowIndex - 1, c: c.cellIndex } : state.cell;
});

function readBack(div, el) {
  const out = JSON.parse(JSON.stringify(el));
  const ed = [...div.querySelectorAll('[data-edit]')];
  if (el.type === 'bullets') {
    const box = ed[0];
    const lines = [...box.children].length ? [...box.children].map(c => ({ text: html2md(c).trim(), level: c.dataset.lvl === '2' ? 2 : 1 }))
      : html2md(box).split('\n').map(t => ({ text: t.trim(), level: 1 }));
    out.items = lines.filter(l => l.text);
  } else if (el.type === 'table') {
    const cols = el.header.length;
    const cells = ed.map(c => html2md(c).trim());
    out.header = cells.slice(0, cols);
    out.rows = el.rows.map((_, i) => cells.slice(cols * (i + 1), cols * (i + 2)));
  } else if (el.type === 'process') {
    out.steps = ed.map(c => html2md(c).trim());
  } else {
    out.text = html2md(ed[0]).trim();
  }
  return out;
}
function finishEdit() {
  if (!state.editing) return;
  state.editing = false;
  const div = document.querySelector(`.stage .el[data-id="${state.sel}"]`), el = selEl();
  if (!div || !el) return render();
  const next = readBack(div, el);
  if (JSON.stringify(next) !== JSON.stringify(el)) commit(() => Object.assign(el, next));
  else render();
}

// ---------- 키보드 ----------
document.addEventListener('keydown', e => {
  if (state.editing) {
    if (e.key === 'Escape') finishEdit();
    if (e.key === 'Tab' && selEl() && selEl().type === 'bullets') {   // 목록 들여쓰기 1↔2단계
      e.preventDefault();
      const n = getSelection().anchorNode;
      const li = n && (n.nodeType === 1 ? n : n.parentElement).closest('.li');
      if (li) li.dataset.lvl = e.shiftKey ? '1' : li.dataset.lvl === '2' ? '1' : '2';
    }
    return;
  }
  if (e.target.closest('input,textarea,dialog')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && selEl()) { e.preventDefault(); act('del'); }
  else if (e.key === 'Escape' && state.sel) { state.sel = null; render(); }
});

// ---------- 도구 모음 ----------
$('#toolbar').addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });   // 글자 선택 유지
$('#toolbar').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b) act(b.dataset.act, b.dataset.color);
});
$('#btn-done').onclick = () => {
  finishEdit();
  if (!deck()) return;
  const title = (deck().slides[0].elements.find(e => e.type === 'title') || {}).text || '회의자료';
  buildPptx(deck(), state.theme).writeFile({ fileName: title.replace(/\*\*/g, '').replace(/[\\/:*?"<>|]/g, '').slice(0, 60) + '.pptx' });
};

const NEW = {
  text: () => ({ type: 'text', fontSize: 14, text: '내용을 입력하세요', w: 4, h: 0.6 }),
  table: () => ({ type: 'table', fontSize: 12, header: ['구분', '항목1', '항목2'], rows: [['', '', ''], ['', '', '']], colW: [2, 3, 3], w: 8, h: 1.2 }),
  process: () => ({ type: 'process', fontSize: 14, steps: ['1단계', '2단계', '3단계'], w: 9, h: 0.75 }),
  note: () => ({ type: 'note', fontSize: 12, text: '※ 유의사항', w: 8, h: 0.7 }),
  conclusion: () => ({ type: 'conclusion', fontSize: 15, text: '결론', w: 8, h: 0.8 }),
};

function act(a, color) {
  if (a === 'bold') { if (state.editing) document.execCommand('bold'); else toast('더블클릭해서 글자를 선택한 뒤 누르세요.'); return; }
  finishEdit();
  if (a === 'undo') return undo();
  const d = deck(); if (!d) return;
  const el = selEl();
  if (a.startsWith('add-')) {
    const n = { ...NEW[a.slice(4)](), id: newId() };
    n.x = (SLIDE_W - n.w) / 2; n.y = (SLIDE_H - n.h) / 2;
    commit(() => slide().elements.push(n));
    state.sel = n.id; return render();
  }
  if (a.startsWith('slide-')) {
    const i = state.cur, ss = d.slides;
    if (a === 'slide-add') commit(() => { ss.splice(i + 1, 0, layoutDeck({ slides: [{ title: '새 슬라이드', blocks: [] }] }).slides[0]); state.cur = i + 1; });
    if (a === 'slide-dup') commit(() => { const c = JSON.parse(JSON.stringify(ss[i])); c.elements.forEach(e => e.id = newId()); ss.splice(i + 1, 0, c); state.cur = i + 1; });
    if (a === 'slide-del') { if (ss.length === 1) return toast('마지막 한 장은 지울 수 없습니다.'); commit(() => { ss.splice(i, 1); state.cur = Math.max(0, i - 1); }); }
    if (a === 'slide-up' && i > 0) commit(() => { [ss[i - 1], ss[i]] = [ss[i], ss[i - 1]]; state.cur = i - 1; });
    if (a === 'slide-down' && i < ss.length - 1) commit(() => { [ss[i + 1], ss[i]] = [ss[i], ss[i + 1]]; state.cur = i + 1; });
    state.sel = null; return render();
  }
  if (!el) return;
  if (a === 'del') { commit(() => slide().elements.splice(slide().elements.indexOf(el), 1)); state.sel = null; return render(); }
  if (a === 'fs-' || a === 'fs+') return commit(() => { el.fontSize = Math.max(6, Math.round(el.fontSize) + (a === 'fs+' ? 1 : -1)); });
  if (a === 'color') return commit(() => { el.color = color; });
  if (el.type === 'table') {
    const cols = el.header.length, rr = state.cell ? state.cell.r : el.rows.length - 1, cc = state.cell ? state.cell.c : cols - 1;
    const rh = el.h / (el.rows.length + 1);
    if (a === 'row+') commit(() => { el.rows.splice(Math.max(rr, -1) + 1, 0, Array(cols).fill('')); el.h += rh; });
    if (a === 'row-' && el.rows.length > 1) commit(() => { el.rows.splice(Math.max(rr, 0), 1); el.h -= rh; });
    if (a === 'col+') commit(() => {
      const ins = cc + 1, add = el.w / (cols + 1), k = (el.w - add) / el.w;
      el.colW = el.colW.map(w => w * k); el.colW.splice(ins, 0, add);
      el.header.splice(ins, 0, ''); el.rows.forEach(r => r.splice(ins, 0, ''));
    });
    if (a === 'col-' && cols > 1) commit(() => {
      const [gone] = el.colW.splice(cc, 1), k = el.w / (el.w - gone);
      el.colW = el.colW.map(w => w * k); el.header.splice(cc, 1); el.rows.forEach(r => r.splice(cc, 1));
    });
    state.cell = null;
  }
  if (el.type === 'process') {
    if (a === 'step+') commit(() => el.steps.push('새 단계'));
    if (a === 'step-' && el.steps.length > 1) commit(() => el.steps.pop());
  }
}

render();
