// 양식 3종. 좌표는 공유하고 색·모양만 다름 → 양식을 바꿔도 편집한 배치가 유지됨
const FONT = '맑은 고딕';
const THEMES = {
  apple: {
    label: 'Apple', text: '1D1D1F', accent: '0071E3', radius: 0.14,
    palette: ['1D1D1F', '0071E3', '6E6E73', 'BF4800', '248A3D'],
    title: { color: '1D1D1F', band: null },
    heading: { color: '1D1D1F', marker: null },
    table: { head: 'F5F5F7', headText: '1D1D1F', border: 'D2D2D7', firstCol: null },
    process: { fill: 'F5F5F7', text: '1D1D1F' },
    note: { fill: 'F5F5F7', text: '6E6E73', line: null },
    conclusion: { fill: '1D1D1F', text: 'FFFFFF', line: null },
  },
  toss: {
    label: 'Toss', text: '191F28', accent: '3182F6', radius: 0.14,
    palette: ['191F28', '3182F6', '4E5968', 'F04452', '00A661'],
    title: { color: '191F28', band: null },
    heading: { color: '3182F6', marker: 'bar' },
    table: { head: 'F2F4F6', headText: '4E5968', border: 'E5E8EB', firstCol: null },
    process: { fill: '3182F6', text: 'FFFFFF' },
    note: { fill: 'F9FAFB', text: '4E5968', line: null },
    conclusion: { fill: 'E8F3FF', text: '1B64DA', line: null },
  },
  posco: {
    label: 'POSCO', text: '111111', accent: '1F3A9E', radius: 0,
    palette: ['111111', '1F3A9E', '555555', 'C00000', '00843D'],
    title: { color: '111111', band: 'posco' },
    heading: { color: '1F3A9E', marker: 'circle' },
    table: { head: '1F3A9E', headText: 'FFFFFF', border: '9FA9C9', firstCol: 'EEF2FA' },
    process: { fill: 'E7E7E7', text: '111111' },
    note: { fill: 'FFFFFF', text: '222222', line: '9FA9C9' },
    conclusion: { fill: 'FFF6D6', text: '111111', line: 'E0B400' },
  },
};

// POSCO 제목 띠(왼쪽 흰색 → 오른쪽 하늘색 + 파란 곡선). 미리보기와 PPT가 같은 그림을 씀
let _band;
function poscoBand() {
  if (_band) return _band;
  const c = document.createElement('canvas');
  c.width = 1280; c.height = 96;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 1280, 0);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.45, '#eef6fc'); grad.addColorStop(1, '#c7e1f5');
  g.fillStyle = grad; g.fillRect(0, 0, 1280, 96);
  g.fillStyle = '#2f80d1';
  g.beginPath(); g.moveTo(1060, 96); g.bezierCurveTo(1150, 70, 1220, 30, 1280, 0); g.lineTo(1280, 96); g.fill();
  g.fillStyle = '#7fb6e6';
  g.beginPath(); g.moveTo(980, 96); g.bezierCurveTo(1100, 80, 1200, 50, 1280, 20); g.lineTo(1280, 40); g.bezierCurveTo(1200, 72, 1120, 90, 1060, 96); g.fill();
  return (_band = c.toDataURL('image/png'));
}
