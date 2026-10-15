// LLM 연결부. 사내 LLM으로 바꿀 때는 callLLM 함수만 고치면 됨 (입력: 프롬프트 문자열, 출력: JSON 객체)
async function callLLM(prompt, { key, model }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini 오류 ${res.status}: ${(body.error && body.error.message) || res.statusText}`);
  const text = (((body.candidates || [])[0] || {}).content || {}).parts?.map(p => p.text || '').join('') || '';
  try { return JSON.parse(text.replace(/^```(json)?|```$/g, '').trim()); }
  catch { throw new Error('LLM 응답을 해석하지 못했습니다. 다시 시도해 주세요.'); }
}

const PAGE_RULES = {
  '1': '정확히 1장. 의사결정자용 한 장 요약: 결론과 핵심 비교 위주. 표는 핵심 행·열만 남기고 셀 문장을 짧게 줄여도 됨. 원문 내용을 줄였다면 omitted=true.',
  '3': '정확히 3장. 원문 내용을 거의 빠짐없이 담되 중복·인사말·불필요한 문구만 삭제. 장수가 모자라 내용을 줄였다면 omitted=true.',
  '5': '정확히 5장. 원문 내용을 빠짐없이 담되 중복·인사말·불필요한 문구만 삭제. 내용이 적으면 소단원을 나눠 5장을 채우고, 그래도 줄였다면 omitted=true.',
  auto: '장수는 내용에 맞게 스스로 결정(한 장에 소단원 1~2개 정도, 한 장이 빽빽하지 않게). 원문 내용을 빠짐없이 담고 중복·불필요한 문구만 삭제. omitted=false.',
};

function buildPrompt(source, mode) {
  return `너는 회의용 PPT를 구성하는 전문가다. 아래 [원문]을 슬라이드 설계도 JSON으로 바꿔라.

[장수 규칙] ${PAGE_RULES[mode]}

[출력 형식] JSON 하나만 출력:
{"omitted": boolean, "slides": [{"title": "슬라이드 제목", "blocks": [블록...]}]}
블록 종류(이것만 사용):
- {"type":"heading","text":"소제목"}
- {"type":"bullets","items":[{"text":"내용","level":1},{"text":"하위 내용","level":2}]}
- {"type":"table","header":["열1","열2"],"rows":[["값","값"]]}
- {"type":"process","steps":["단계1","단계2"]}   ← 순서가 있는 절차·흐름(→)일 때
- {"type":"note","text":"※ 주석·유의사항"}         ← ※ 표시나 유의사항
- {"type":"conclusion","text":"결론 문장"}          ← 결론·권고·의사결정 요청

[작성 규칙]
- 한국어. 원문 표현과 수치를 최대한 그대로 쓴다. 지어내지 않는다.
- 원문이 표이면 표로 유지한다. 한 표를 여러 장에 나누지 않는다(행이 8개 넘을 때만 예외).
- 원문의 번호 붙은 큰 단원은 슬라이드 제목 또는 heading으로 쓴다. 제목에 "1." 같은 번호가 있으면 유지한다.
- 핵심 숫자·결론 단어는 **굵게** 표시한다(텍스트 안에 **...** 사용). 남용하지 않는다.
- 문장은 개조식(~함, ~필요)으로 짧게. 표 셀도 간결하게.
- 표지 슬라이드는 만들지 않는다. 대신 문서 전체 제목이 있으면 첫 슬라이드 제목으로 쓰고, 그 슬라이드의 단원 제목은 heading으로 넣는다.

[원문]
${source}`;
}
