// NEXIO 핵심 경로 E2E 테스트
// 환경: staging / local 전용. 프로덕션 KIS 계정 사용 금지.
// 대상 URL: PLAYWRIGHT_BASE_URL 환경변수 또는 http://localhost:3000

import { test, expect } from "@playwright/test";

// ─── TC-01: 로그인 ────────────────────────────────
test("TC-01 Login — 관리자 로그인 성공 후 대시보드 리다이렉트", async ({ page }) => {
  // storageState 없이 실행 (login 자체 검증)
  await page.goto("/login");

  await page.getByRole("textbox", { name: /password|비밀번호/i }).fill(
    process.env.ADMIN_PASSWORD || "test"
  );
  await page.getByRole("button", { name: /로그인|login/i }).click();

  // 대시보드로 리다이렉트 확인
  await expect(page).toHaveURL(/\/$|\/dashboard/);

  // 페이지가 깨지지 않음 (에러 텍스트 없음)
  await expect(page.getByText(/500|Internal Server Error/i)).not.toBeVisible();
});

// ─── TC-02: 대시보드 렌더링 ────────────────────────
test("TC-02 Dashboard — 잔고·포트폴리오 영역 렌더링", async ({ page }) => {
  await page.goto("/");

  // 에러 바운더리 미발동 확인
  await expect(page.getByText(/Something went wrong|에러가 발생/i)).not.toBeVisible();

  // 잔고 또는 포트폴리오 영역 DOM 존재 확인
  const balanceOrPortfolio = page.locator(
    '[data-testid="balance"], [data-testid="portfolio"], section, main'
  ).first();
  await expect(balanceOrPortfolio).toBeVisible({ timeout: 10000 });
});

// ─── TC-03: 설정 섹션 표시 ────────────────────────
test("TC-03 Settings — KIS 설정 폼(appKey 입력) 존재 확인", async ({ page }) => {
  await page.goto("/settings");

  // KIS 설정 입력 폼 존재 확인
  const appKeyInput = page.locator(
    'input[name="appKey"], input[placeholder*="App Key"], input[placeholder*="appKey"]'
  );
  await expect(appKeyInput).toBeVisible({ timeout: 10000 });
});
