import { test, expect } from '@playwright/test';

/**
 * 핵심 기능 점검 테스트 (Sanity Test)
 * 
 * 테스트 시나리오:
 * 1. 고객 관리: 고객 추가 -> 목록 확인 -> 삭제
 * 2. 제품 관리: 제품 추가 -> 목록 확인
 * 3. 매출 관리: 매출 등록 -> 목록 확인
 * 4. 대시보드: 숫자 표시 확인
 */

test.describe('CRM 핵심 기능 점검', () => {
  let testClientName = '테스트 기업 E2E';
  let testProductName = '테스트 제품 E2E';
  let testClientId: string | null = null;

  test.beforeEach(async ({ page }) => {
    // 대시보드로 이동
    await page.goto('/');
    // 페이지 로딩 대기
    await page.waitForLoadState('networkidle');
  });

  test('1. 고객 관리 - 추가 및 삭제', async ({ page }) => {
    // alert 다이얼로그 리스너 설정
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // 고객 관리 탭 클릭
    await page.getByRole('link', { name: 'Customers' }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 고객 추가 버튼 클릭
    const addButton = page.getByRole('button').filter({ hasText: /NEW_CLIENT/i });
    await addButton.click();
    await page.waitForTimeout(500);

    // 모달이 열렸는지 확인
    const modalHeading = page.getByRole('heading', { name: '고객 추가' });
    await expect(modalHeading).toBeVisible();
    await page.waitForTimeout(1000);

    // 모달 내부의 input 찾기
    const modalContent = modalHeading.locator('xpath=ancestor::div[contains(@class, "bg-white") or contains(@role, "dialog")]').first();
    await modalContent.waitFor({ state: 'visible', timeout: 10000 });
    const companyInput = modalContent.locator('input[type="text"]').first();
    await companyInput.waitFor({ state: 'visible', timeout: 10000 });
    await companyInput.fill(testClientName);

    // 상태 선택
    const statusSelect = modalContent.locator('select').first();
    if (await statusSelect.count() > 0) {
      await statusSelect.waitFor({ state: 'visible', timeout: 5000 });
      await statusSelect.selectOption('활성');
    }

    // 저장 버튼 클릭 ("Save")
    await page.getByRole('button', { name: 'Save' }).click();

    // 처리 대기
    await page.waitForTimeout(3000);

    // 모달이 닫혔는지 확인
    await expect(page.getByRole('heading', { name: '고객 추가' })).not.toBeVisible({ timeout: 10000 });

    // 목록이 업데이트될 때까지 대기
    const row = page.locator('tr').filter({ hasText: testClientName });
    await expect(row).toBeVisible({ timeout: 15000 });

    // 삭제: 리뉴얼된 UI에서는 체크박스 선택 후 하단 Delete Selection 버튼을 누릅니다.
    const checkbox = row.locator('input[type="checkbox"]').first();
    await checkbox.check();
    await page.waitForTimeout(1000);

    const deleteSelectionButton = page.getByRole('button', { name: /Delete Selection/i });
    await expect(deleteSelectionButton).toBeVisible();
    await deleteSelectionButton.click();

    // 처리 대기
    await page.waitForTimeout(3000);

    // 목록에서 삭제되었는지 확인
    const deletedRow = page.locator('tr').filter({ hasText: testClientName });
    await expect(deletedRow).not.toBeVisible({ timeout: 15000 });
  });

  test('2. 제품 관리 - 추가', async ({ page }) => {
    // alert 다이얼로그 리스너 설정
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // 제품 관리 URL로 직접 이동 (Navbar에서 제거되었으므로)
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 제품 추가 버튼 클릭
    const addButton = page.getByRole('button').filter({ hasText: /제품 추가/ });
    await addButton.click();
    await page.waitForTimeout(500);

    // 모달이 열렸는지 확인
    const productModalHeading = page.getByRole('heading', { name: '제품 추가' });
    await expect(productModalHeading).toBeVisible();
    await page.waitForTimeout(1000);

    // 모달 내부의 input 찾기
    const productModalContent = productModalHeading.locator('xpath=ancestor::div[contains(@class, "bg-white") or contains(@role, "dialog")]').first();
    await productModalContent.waitFor({ state: 'visible', timeout: 10000 });
    const nameInput = productModalContent.locator('input[type="text"]').first();
    await nameInput.waitFor({ state: 'visible', timeout: 10000 });
    await nameInput.fill(testProductName);

    // 종류 선택
    const typeSelect = productModalContent.locator('select').first();
    await typeSelect.waitFor({ state: 'visible', timeout: 5000 });
    await typeSelect.selectOption('제품');

    // 저장 버튼 클릭
    await page.getByRole('button', { name: '저장' }).click();

    // 처리 대기
    await page.waitForTimeout(3000);

    // 모달이 닫혔는지 확인
    await expect(page.getByRole('heading', { name: '제품 추가' })).not.toBeVisible({ timeout: 10000 });

    // 목록이 업데이트될 때까지 대기
    const row = page.locator('tr').filter({ hasText: testProductName });
    await expect(row).toBeVisible({ timeout: 15000 });
  });

  test('3. 매출 관리 - 등록', async ({ page }) => {
    // alert 다이얼로그 리스너 설정
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // 고객 추가 (Customers 페이지)
    await page.getByRole('link', { name: 'Customers' }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const addClientButton = page.getByRole('button').filter({ hasText: /NEW_CLIENT/i });
    await addClientButton.click();
    await page.waitForTimeout(500);

    const clientModalHeading = page.getByRole('heading', { name: '고객 추가' });
    await expect(clientModalHeading).toBeVisible();
    const clientModalContent = clientModalHeading.locator('xpath=ancestor::div[contains(@role, "dialog") or contains(@class, "bg-white")]').first();
    const companyInput = clientModalContent.locator('input[type="text"]').first();
    await companyInput.fill(testClientName);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(2000);

    // 제품 추가
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const addProductButton = page.getByRole('button').filter({ hasText: /제품 추가/ });
    await addProductButton.click();
    await page.waitForTimeout(500);

    const productModalHeading2 = page.getByRole('heading', { name: '제품 추가' });
    await expect(productModalHeading2).toBeVisible();
    const productModalContent2 = productModalHeading2.locator('xpath=ancestor::div[contains(@role, "dialog") or contains(@class, "bg-white")]').first();
    const nameInput2 = productModalContent2.locator('input[type="text"]').first();
    await nameInput2.fill(testProductName);
    await page.getByRole('button', { name: '저장' }).click();
    await page.waitForTimeout(2000);

    // 매출 관리 탭 클릭
    await page.getByRole('link', { name: 'Sales' }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 매출 추가 버튼 클릭
    const addSaleButton = page.getByRole('button').filter({ hasText: /매출 등록|ADD_STATEMENT/i });
    await addSaleButton.click();
    await page.waitForTimeout(500);

    const saleModalHeading = page.locator('text=/RECORD_ENTRY: SALES_TRANS/i').first();
    await expect(saleModalHeading).toBeVisible();
    await page.waitForTimeout(1000);

    const saleModalContent = saleModalHeading.locator('xpath=ancestor::div[contains(@role, "dialog") or contains(@class, "bg-white")]').first();
    await saleModalContent.waitFor({ state: 'visible', timeout: 10000 });

    // Client Combobox 찾기 (input placeholder로 찾기)
    const clientComboboxInput = saleModalContent.locator('input[placeholder*="거래처 검색"]').first();
    await clientComboboxInput.fill(testClientName);
    await page.waitForTimeout(1000);
    // 첫번째 검색 결과 클릭
    const clientOption = page.locator('.combobox-option').first();
    await clientOption.waitFor({ state: 'visible', timeout: 5000 });
    await clientOption.click();

    // 품목 Combobox 찾기
    const itemSection = saleModalContent.locator('table').first();
    const productComboboxInput = itemSection.locator('input[placeholder*="Search product"]').first();
    await productComboboxInput.fill(testProductName);
    await page.waitForTimeout(1000);
    // 첫번째 검색 결과 클릭
    const productOption = page.locator('.combobox-option').first();
    await productOption.waitFor({ state: 'visible', timeout: 5000 });
    await productOption.click();

    // 수량 입력 (number 타입 input)
    const quantityInput = itemSection.locator('input[type="number"]').first();
    await quantityInput.waitFor({ state: 'visible', timeout: 5000 });
    await quantityInput.fill('10');

    // 단가 입력 (두번째 number 타입 input)
    const unitPriceInput = itemSection.locator('input[type="number"]').nth(1);
    await unitPriceInput.waitFor({ state: 'visible', timeout: 5000 });
    await unitPriceInput.fill('10000');

    await page.waitForTimeout(1000);

    // 저장 버튼 클릭
    await page.getByRole('button', { name: /COMMIT_SALE/i }).click();

    // 처리 대기
    await page.waitForTimeout(3000);

    // 모달이 닫혔는지 확인
    await expect(page.locator('text=/RECORD_ENTRY: SALES_TRANS/i')).not.toBeVisible({ timeout: 5000 });

    // 목록이 업데이트될 때까지 대기
    const saleRow = page.locator('tr').filter({ hasText: testClientName });
    await expect(saleRow).toBeVisible({ timeout: 15000 });
  });

  test('4. 대시보드 - 숫자 표시 확인', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 리뉴얼된 KPI 카드들이 표시되는지 확인
    await expect(page.getByText(/TOTAL CUSTOMERS/i)).toBeVisible();
    await expect(page.getByText(/ACTIVE CUSTOMERS/i)).toBeVisible();
    await expect(page.getByText(/MONTHLY REVENUE/i)).toBeVisible();
    await expect(page.getByText(/7-DAY TREND/i)).toBeVisible();

    // 숫자가 표시되는지 확인 (TOTAL CUSTOMERS 아래의 숫자)
    const totalClientsContainer = page.locator('text=/TOTAL CUSTOMERS/i').locator('xpath=following-sibling::div[1] | ../following-sibling::*');
    await expect(totalClientsContainer.first()).toBeVisible({ timeout: 5000 });

    // 리뉴얼된 대시보드 섹션 확인
    await expect(page.getByText(/EXECUTIVE DASHBOARD/i)).toBeVisible();
  });
});


