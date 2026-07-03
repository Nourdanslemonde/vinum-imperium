#!/usr/bin/env node
/*
 * VINUM IMPERIUM — 퀴즈 데이터 검증기
 * index.html 안의 QUIZ 객체를 뽑아 정합성을 검사한다.
 *   - 티어 1~5가 모두 존재하는지
 *   - 각 문항: 질문/해설 비어있지 않음, 보기 4개(모두 채워짐), 정답 인덱스 0~3
 *   - 같은 티어 안에서 질문 중복 없음
 * 사용법:  node tools/validate-quiz.mjs
 * 통과 시 종료코드 0, 문제 있으면 1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

// QUIZ 객체 추출: `const QUIZ = { ... \n};`
const m = html.match(/const QUIZ = (\{[\s\S]*?\n\});/);
if (!m) { console.error('❌ index.html에서 QUIZ 객체를 찾지 못했습니다.'); process.exit(1); }

let QUIZ;
try {
  QUIZ = new Function('return (' + m[1] + ')')();
} catch (e) {
  console.error('❌ QUIZ 파싱 실패 (문법 오류 가능):', e.message);
  process.exit(1);
}

const errors = [];
const warnings = [];
const TIERS = [1, 2, 3, 4, 5];

for (const t of TIERS) {
  const arr = QUIZ[t];
  if (!Array.isArray(arr)) { errors.push(`티어 ${t}: 배열이 아니거나 없음`); continue; }

  const seen = new Map();
  arr.forEach((q, i) => {
    const at = `T${t}#${i + 1}`;
    if (!q || typeof q !== 'object') { errors.push(`${at}: 문항 객체가 아님`); return; }
    if (typeof q.q !== 'string' || !q.q.trim()) errors.push(`${at}: 질문(q)이 비었음`);
    if (typeof q.e !== 'string' || !q.e.trim()) errors.push(`${at}: 해설(e)이 비었음`);
    if (!Array.isArray(q.c)) errors.push(`${at}: 보기(c)가 배열이 아님`);
    else {
      if (q.c.length !== 4) errors.push(`${at}: 보기 개수 ${q.c.length} (4개여야 함)`);
      q.c.forEach((c, ci) => {
        if (typeof c !== 'string' || !c.trim()) errors.push(`${at}: 보기[${ci}]가 비었음`);
      });
      const uniq = new Set(q.c.map(x => String(x).trim()));
      if (uniq.size !== q.c.length) errors.push(`${at}: 보기 중복 있음`);
    }
    if (!Number.isInteger(q.a) || q.a < 0 || q.a > 3) errors.push(`${at}: 정답 인덱스(a)=${q.a} (0~3이어야 함)`);
    else if (Array.isArray(q.c) && (typeof q.c[q.a] !== 'string' || !q.c[q.a].trim()))
      errors.push(`${at}: 정답이 가리키는 보기가 비었음`);

    const key = (q.q || '').trim();
    if (seen.has(key)) errors.push(`${at}: 질문 중복 (T${t}#${seen.get(key) + 1}와 동일)`);
    else seen.set(key, i);
  });
}

// 요약 출력
console.log('── VINUM IMPERIUM 퀴즈 검증 ──');
let total = 0;
for (const t of TIERS) {
  const n = Array.isArray(QUIZ[t]) ? QUIZ[t].length : 0;
  total += n;
  const flag = n < 20 ? '  ⚠ 원정마다 5문항 랜덤 → 문항이 적으면 반복 체감' : '';
  if (n < 20) warnings.push(`티어 ${t}: 문항 ${n}개 (20개 이상 권장)`);
  console.log(`  티어 ${t}: ${n}문항${flag}`);
}
console.log(`  합계: ${total}문항`);

if (warnings.length) {
  console.log('\n⚠ 경고');
  warnings.forEach(w => console.log('  - ' + w));
}
if (errors.length) {
  console.log(`\n❌ 오류 ${errors.length}건`);
  errors.forEach(e => console.log('  - ' + e));
  process.exit(1);
}
console.log('\n✅ 통과 — 모든 문항 구조가 정상입니다.');
