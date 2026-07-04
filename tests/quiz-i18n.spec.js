// VINUM IMPERIUM — 영어 모드에서 퀴즈 본문(문항·보기·해설)이 영어로 출제되는지 검증
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const GAME_URL = pathToFileURL(path.join(__dirname, '..', 'index.html')).href + '?new';

async function fresh(page) {
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(GAME_URL);
}

// 언어를 고르고 게임 화면으로 진입한 뒤, 티어1 정식 퀴즈를 연다
async function openNormalQuiz(page, lang) {
  await fresh(page);
  await page.getByRole('button', { name: lang === 'en' ? 'English' : '한국어' }).click();
  return await page.evaluate(() => {
    S = newState('georgia', { name: 'Tester', gender: 'f', vi: 0 }, 'normal');
    S.tutorialDone = true;
    ['langmodal', 'intromodal', 'howtomodal', 'startmodal', 'charmodal']
      .forEach(id => { const e = document.getElementById(id); if (e) e.classList.add('hidden'); });
    selRegion = S.startId; renderAll();
    const r = REGIONS.find(x => x.id === 'hellas');
    quiz = { mode: 'conquest', region: r, qs: pickQuestions(r.tier, 5), idx: 0, correct: 0 };
    document.getElementById('quizmodal').classList.remove('hidden');
    showQuestion();
    const q = quiz.qs[0];
    return { ko: q.q, en: q.q_en, cEn: q.c_en, eEn: q.e_en };
  });
}

test('영어 모드: 문항 텍스트가 영어(q_en)로 표시된다', async ({ page }) => {
  const q = await openNormalQuiz(page, 'en');
  expect(q.en).toBeTruthy();
  await expect(page.locator('#qtext')).toHaveText(q.en);   // 영어 문항
  expect(q.en).not.toBe(q.ko);                             // 한국어와 다름
});

test('영어 모드: 보기 4개가 모두 영어 보기(c_en)로 표시된다', async ({ page }) => {
  const q = await openNormalQuiz(page, 'en');
  const choices = page.locator('#qchoices .choice');
  await expect(choices).toHaveCount(4);
  // 각 보기 버튼 텍스트에 대응하는 영어 보기가 포함돼야 함 (앞에 "Ⅰ. " 넘버링이 붙음)
  for (const c of q.cEn) {
    await expect(page.locator('#qchoices')).toContainText(c);
  }
});

test('영어 모드: 해설도 영어(e_en)로 표시된다', async ({ page }) => {
  const q = await openNormalQuiz(page, 'en');
  // 첫 보기를 눌러 해설 노출
  await page.locator('#qchoices .choice').first().click();
  await expect(page.locator('#qexp')).toBeVisible();
  await expect(page.locator('#qexp')).toContainText(q.eEn);
});

test('한국어 모드: 문항 텍스트가 한국어(q)로 표시된다', async ({ page }) => {
  const q = await openNormalQuiz(page, 'ko');
  await expect(page.locator('#qtext')).toHaveText(q.ko);
});
