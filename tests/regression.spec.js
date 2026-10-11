// VINUM IMPERIUM — 2026-10 리뷰에서 찾은 버그·밸런스 수정의 회귀 테스트
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const BASE_URL = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

// 새 게임 상태를 만들고(셋업 모달 생략) 저장까지 해 둔다. 새로고침 테스트를 위해 addInitScript로 저장소를 지우지 않는다.
async function startGame(page, opts = {}) {
  await page.goto(BASE_URL + '?new');
  await page.getByRole('button', { name: '한국어' }).click();
  await page.evaluate((o) => {
    S = newState('georgia', { name: 'Tester', gender: 'f', vi: 0 }, 'normal');
    S.tutorialDone = o.tutorialDone !== undefined ? o.tutorialDone : true;
    if (o.supplies !== undefined) S.supplies = o.supplies;
    if (o.wine !== undefined) S.wine = o.wine;
    if (o.gold !== undefined) S.gold = o.gold;
    ['langmodal', 'intromodal', 'howtomodal', 'startmodal', 'charmodal']
      .forEach(id => { const e = document.getElementById(id); if (e) e.classList.add('hidden'); });
    selRegion = S.startId;
    renderAll();
  }, opts);
}
// 저장된 상태로 새로고침 (?new 없이)
async function reload(page) {
  await page.goto(BASE_URL);
}
// 정식 정복전 퀴즈를 이동 애니메이션 없이 연다 (startConquest의 일반 분기와 동일한 구성)
async function openConquest(page, regionId) {
  await page.evaluate((id) => {
    const r = REGIONS.find(x => x.id === id);
    quiz = { mode: 'conquest', region: r, qs: pickQuestions(r.tier, 5), idx: 0, correct: 0, reveals: 0 };
    openQuiz();
    save();
  }, regionId);
  await expect(page.locator('#quizmodal')).toBeVisible();
}

test('원정 행군 중 다른 지역을 클릭해도 퀴즈가 열린다 (비용만 날아가던 버그)', async ({ page }) => {
  await startGame(page, { supplies: 30, wine: 2 });
  await page.evaluate(() => { startConquest('hellas'); selectRegion('armenia'); });
  await expect(page.locator('#quizmodal')).toBeVisible({ timeout: 10000 });
  expect(await page.evaluate(() => quiz.region.id)).toBe('hellas');
});

test('행군 중 새로고침해도 원정 퀴즈가 이어진다', async ({ page }) => {
  await startGame(page, { supplies: 30, wine: 2 });
  await page.evaluate(() => startConquest('hellas'));
  await reload(page);
  await expect(page.locator('#quizmodal')).toBeVisible();
  expect(await page.evaluate(() => ({ id: quiz.region.id, sup: S.supplies }))).toEqual({ id: 'hellas', sup: 20 });
});

test('「오답 2개 지우기」 후 물자 부족이면 「정답 확인」이 막히고 타이머는 계속 흐른다', async ({ page }) => {
  await startGame(page, { supplies: 5 }); // 티어1 보통: 지우기 2, 확인 4
  await openConquest(page, 'hellas');
  await page.locator('#fiftybtn').click();
  await expect(page.locator('#revealbtn')).toBeDisabled();
  await page.evaluate(() => reveal()); // 버튼을 우회해 직접 불러도 무시돼야 함
  const w1 = await page.locator('#sandbar').evaluate(el => parseFloat(el.style.width));
  await page.waitForTimeout(800);
  const w2 = await page.locator('#sandbar').evaluate(el => parseFloat(el.style.width));
  expect(w2).toBeLessThan(w1);
  expect(await page.evaluate(() => quiz.answered)).toBe(false);
});

test('「정답 확인」은 정식 정복전에서 원정당 1회만', async ({ page }) => {
  await startGame(page, { supplies: 200 });
  await openConquest(page, 'hellas');
  await page.locator('#revealbtn').click();
  await page.locator('#qnextbtn').click();
  await expect(page.locator('#revealbtn')).toBeDisabled();
});

test('타이머는 실제 시각 기준 — 마감 시각이 지나면 시간 초과', async ({ page }) => {
  await startGame(page);
  await openConquest(page, 'hellas');
  await page.evaluate(() => { quiz.deadline = Date.now() - 1; });
  await expect(page.locator('#qexp')).toContainText('시간의 모래가 다 떨어졌다');
});

test('답한 뒤 새로고침하면 같은 문항을 다시 풀 수 없고 다음 문항으로 간다', async ({ page }) => {
  await startGame(page);
  await openConquest(page, 'hellas');
  const wrongIdx = await page.evaluate(() => { const a = quiz.qs[0].a; return [0, 1, 2, 3].find(i => i !== a); });
  await page.locator('#qchoices .choice').nth(wrongIdx).click();
  await reload(page);
  await expect(page.locator('#quizmodal')).toBeVisible();
  await expect(page.locator('#qprogress')).toHaveText('2 / 5 (정답 0)');
});

test('방어전은 새로고침으로 피할 수 없다', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => { startDefense(REGIONS.find(x => x.id === 'colchis')); renderAll(); });
  await reload(page);
  await expect(page.locator('#quizmodal')).toBeVisible();
  expect(await page.evaluate(() => quiz.mode)).toBe('defense');
});

test('건설·판매 같은 행동이 즉시 저장된다', async ({ page }) => {
  await startGame(page, { gold: 200, wine: 3 });
  await page.evaluate(() => { build('colchis', 'cellar', 30, 0); sellWine('colchis', 3); });
  const before = await page.evaluate(() => S.gold);
  await reload(page);
  const after = await page.evaluate(() => ({ gold: S.gold, cellar: S.regions.colchis.b.cellar }));
  expect(after).toEqual({ gold: before, cellar: true });
});

test('튜토리얼은 시작 지역 티어 이하에만 — 상위 티어 첫 정복은 정식 규칙', async ({ page }) => {
  await startGame(page, { tutorialDone: false, supplies: 100, wine: 10 });
  await page.evaluate(() => startConquest('campania')); // 조지아 시작=티어1, 캄파니아=티어2
  const res = await page.evaluate(() => ({ tut: !!quiz.tutorial, n: quiz.qs.length, td: S.tutorialDone }));
  expect(res).toEqual({ tut: false, n: 5, td: true });
});

test('제국의 마지막 시장·양조장은 지진·약탈로 무너지지 않는다', async ({ page }) => {
  await startGame(page);
  const keys = await page.evaluate(() => {
    S.regions.colchis.b = { winery: true, market: true, wall: true, cellar: false };
    return destructibleKeys('colchis');
  });
  expect(keys).toEqual(['wall']);
});

test('깨진 세이브는 무시하고 새 게임 화면으로', async ({ page }) => {
  await page.goto(BASE_URL + '?new');
  await page.evaluate(() => localStorage.setItem('vinum_save', JSON.stringify({ year: 3 })));
  await reload(page);
  await expect(page.locator('#langmodal')).toBeVisible();
});
