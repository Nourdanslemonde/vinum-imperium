// VINUM IMPERIUM — 첫 정복 튜토리얼 퀴즈의 실제 동작 e2e
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const GAME_URL = pathToFileURL(path.join(__dirname, '..', 'index.html')).href + '?new';

async function fresh(page) {
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(GAME_URL);
}

// 셋업 모달을 건너뛰고 게임 상태를 만든 뒤, 튜토리얼 퀴즈를 직접 연다
// (startConquest의 튜토리얼 분기와 동일한 quiz 구성 → 이동 애니메이션만 생략)
async function openTutorialQuiz(page) {
  await fresh(page);
  await page.getByRole('button', { name: '한국어' }).click();
  await page.evaluate(() => {
    S = newState('georgia', { name: 'Tester', gender: 'f', vi: 0 }, 'normal');
    S.tutorialDone = false;
    ['langmodal', 'intromodal', 'howtomodal', 'startmodal', 'charmodal']
      .forEach(id => { const e = document.getElementById(id); if (e) e.classList.add('hidden'); });
    selRegion = S.startId;
    renderAll();
    const r = REGIONS.find(x => x.id === 'hellas');
    quiz = { mode: 'conquest', tutorial: true, region: r, qs: pickTutorialQuestions(3), idx: 0, correct: 0 };
    openQuiz();
  });
  await expect(page.locator('#quizmodal')).toBeVisible();
}

test('튜토리얼: 시간제한 없음 + 코칭 배너 + 진행 표기', async ({ page }) => {
  await openTutorialQuiz(page);
  await expect(page.locator('#sandlabel')).toHaveText(/연습/);       // 타이머 대신 "연습"
  await expect(page.locator('#qcoach')).toBeVisible();               // 규칙 코칭 배너
  await expect(page.locator('#qprogress')).toHaveText('튜토리얼 · 1 / 3');
  // 모래시계 타이머가 실제로 돌지 않는지 (1.2초 후에도 폭 100% 유지)
  const w1 = await page.locator('#sandbar').evaluate(el => el.style.width);
  await page.waitForTimeout(1200);
  const w2 = await page.locator('#sandbar').evaluate(el => el.style.width);
  expect(w1).toBe('100%');
  expect(w2).toBe('100%');
});

test('튜토리얼: 오답이면 실패 대신 "다시 도전"으로 같은 문항 재출제', async ({ page }) => {
  await openTutorialQuiz(page);
  const wrongIdx = await page.evaluate(() => { const a = quiz.qs[quiz.idx].a; return [0, 1, 2, 3].find(i => i !== a); });
  await page.locator('#qchoices .choice').nth(wrongIdx).click();
  await expect(page.locator('#qexp')).toBeVisible();                 // 해설 노출
  await expect(page.locator('#qnextbtn')).toHaveText(/다시 도전/);
  await page.locator('#qnextbtn').click();
  await expect(page.locator('#qprogress')).toHaveText('튜토리얼 · 1 / 3'); // idx 유지(재도전)
});

test('튜토리얼: 3문항 완료 시 지역 정복 + tutorialDone=true', async ({ page }) => {
  await openTutorialQuiz(page);
  // 첫 문항 일부러 오답 → 재도전, 이후 3문항 정답으로 완료
  const wrongIdx = await page.evaluate(() => { const a = quiz.qs[quiz.idx].a; return [0, 1, 2, 3].find(i => i !== a); });
  await page.locator('#qchoices .choice').nth(wrongIdx).click();
  await page.locator('#qnextbtn').click();

  for (let k = 0; k < 3; k++) {
    const correctIdx = await page.evaluate(() => quiz.qs[quiz.idx].a);
    await page.locator('#qchoices .choice').nth(correctIdx).click();
    await expect(page.locator('#qnextbtn')).toBeVisible();
    await page.locator('#qnextbtn').click();
  }
  await expect(page.locator('#quizmodal')).toBeHidden();
  const res = await page.evaluate(() => ({ owned: S.regions.hellas.owned, td: S.tutorialDone }));
  expect(res.owned).toBe(true);
  expect(res.td).toBe(true);
});

test('두 번째 정복은 정식 규칙(5문제·타이머)로 전환', async ({ page }) => {
  await openTutorialQuiz(page);
  // 튜토리얼 완료 처리
  await page.evaluate(() => { S.tutorialDone = true; });
  // 정식 정복전 구성(startConquest의 일반 분기와 동일)
  await page.evaluate(() => {
    const r = REGIONS.find(x => x.id === 'armenia');
    quiz = { mode: 'conquest', region: r, qs: pickQuestions(r.tier, 5), idx: 0, correct: 0 };
    document.getElementById('quizmodal').classList.remove('hidden');
    showQuestion();
  });
  await expect(page.locator('#sandlabel')).toHaveText(/시간의 모래|Sands/); // 타이머 라벨
  await expect(page.locator('#qcoach')).toBeHidden();                        // 코칭 배너 없음
  const n = await page.evaluate(() => quiz.qs.length);
  expect(n).toBe(5);
  // 타이머가 실제로 감소하는지
  await page.waitForTimeout(700);
  const w = await page.locator('#sandbar').evaluate(el => parseFloat(el.style.width));
  expect(w).toBeLessThan(100);
});
