// VINUM IMPERIUM — 언어 선택/전환 + 튜토리얼 배선 검증
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const GAME_URL = pathToFileURL(path.join(__dirname, '..', 'index.html')).href + '?new';

// 매 테스트 전 로컬스토리지(언어·세이브) 초기화 후 로드
async function fresh(page) {
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(GAME_URL);
}

test.describe('언어 선택 (시작 화면)', () => {
  test('새 게임에서 언어 선택 모달이 뜨고 두 옵션이 보인다', async ({ page }) => {
    await fresh(page);
    await expect(page.locator('#langmodal')).toBeVisible();
    await expect(page.getByRole('button', { name: '한국어' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'English' })).toBeVisible();
  });

  test('English 선택 → 인트로가 영어, 고정 버튼은 "한글"', async ({ page }) => {
    await fresh(page);
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('#langmodal')).toBeHidden();
    await expect(page.locator('#intromodal')).toBeVisible();
    await expect(page.locator('#subtitle')).toHaveText('Wine Conquest');
    await expect(page.locator('#langbtn')).toHaveText('한글');
  });

  test('한국어 선택 → 인트로가 한국어, 고정 버튼은 "EN"', async ({ page }) => {
    await fresh(page);
    await page.getByRole('button', { name: '한국어' }).click();
    await expect(page.locator('#subtitle')).toHaveText('포도주 정복기');
    await expect(page.locator('#langbtn')).toHaveText('EN');
  });
});

test.describe('언어 전환 (중간, 고정 버튼)', () => {
  test('인트로 화면에서 우상단 버튼으로 한↔영 전환된다', async ({ page }) => {
    await fresh(page);
    await page.getByRole('button', { name: '한국어' }).click();
    await expect(page.locator('#subtitle')).toHaveText('포도주 정복기');

    await page.locator('#langbtn').click(); // → 영어
    await expect(page.locator('#subtitle')).toHaveText('Wine Conquest');
    await expect(page.locator('#langbtn')).toHaveText('한글');

    await page.locator('#langbtn').click(); // → 한국어
    await expect(page.locator('#subtitle')).toHaveText('포도주 정복기');
    await expect(page.locator('#langbtn')).toHaveText('EN');
  });

  test('규칙 화면에서 언어를 바꿔도 「계속」 버튼이 동작한다 (재바인딩 버그 수정)', async ({ page }) => {
    await fresh(page);
    await page.getByRole('button', { name: '한국어' }).click();
    await page.evaluate(() => openHowTo(true)); // 진영 선택 흐름의 규칙 화면
    await expect(page.locator('#howtomodal')).toBeVisible();

    await page.locator('#langbtn').click(); // 규칙 화면 열린 채 영어로 전환
    await expect(page.locator('#subtitle')).toHaveText('Wine Conquest');

    await page.locator('#howtobtn').click(); // 핸들러가 유지돼 진영 선택으로 넘어가야 함
    await expect(page.locator('#howtomodal')).toBeHidden();
    await expect(page.locator('#startmodal')).toBeVisible();
  });
});

test.describe('튜토리얼 배선', () => {
  test('새 상태 tutorialDone=false, 튜토리얼 문항 3개 출제', async ({ page }) => {
    await fresh(page);
    const r = await page.evaluate(() => {
      const st = newState('georgia', { name: 'Tester', gender: 'f', vi: 0 }, 'normal');
      const picked = pickTutorialQuestions(3);
      return {
        tutorialDone: st.tutorialDone,
        tqLen: TUTORIAL_QUIZ.length,
        pickedLen: picked.length,
        eachHas4: picked.every(q => Array.isArray(q.c) && q.c.length === 4),
        eachHasEn: picked.every(q => !!q.q_en),
      };
    });
    expect(r.tutorialDone).toBe(false);
    expect(r.tqLen).toBeGreaterThanOrEqual(3);
    expect(r.pickedLen).toBe(3);
    expect(r.eachHas4).toBe(true);
    expect(r.eachHasEn).toBe(true);
  });
});
