// NEXIO Playwright 전역 인증 셋업
// 로그인 후 세션 상태를 tests/.auth/user.json에 저장.
// core.spec.ts의 모든 테스트는 이 storageState를 재사용한다.

import { test as setup } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, ".auth/user.json");

setup("authenticate", async ({ page }) => {
  await page.goto("/login");

  // ID + 비밀번호 입력
  await page.getByPlaceholder("아이디").fill(process.env.ADMIN_ID || "admin");
  await page.getByPlaceholder("비밀번호").fill(process.env.ADMIN_PASSWORD || "test");
  await page.getByRole("button", { name: /로그인|login/i }).click();

  // 대시보드 리다이렉트 대기
  await page.waitForURL(/\/$|\/dashboard/, { timeout: 10000 });

  // 인증 상태 저장
  await page.context().storageState({ path: authFile });
});
