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
    await page.getByRole('link', { name: '고객 관리' }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 고객 추가 버튼 클릭
    const addButton = page.getByRole('button').filter({ hasText: /고객 추가/ });
    await addButton.click();
    await page.waitForTimeout(500);
    
    // 모달이 열렸는지 확인
    const modalHeading = page.getByRole('heading', { name: '고객 추가' });
    await expect(modalHeading).toBeVisible();
    await page.waitForTimeout(1000);

    // 모달 내부의 input 찾기
    const modalContent = modalHeading.locator('xpath=ancestor::div[contains(@class, "bg-white")]').first();
    await modalContent.waitFor({ state: 'visible', timeout: 10000 });
    const companyInput = modalContent.locator('input[type="text"]').first();
    await companyInput.waitFor({ state: 'visible', timeout: 10000 });
    await companyInput.fill(testClientName);
    
    // 담당자 입력
    const inputs = modalContent.locator('input[type="text"]');
    if (await inputs.count() > 1) {
      await inputs.nth(1).waitFor({ state: 'visible', timeout: 5000 });
      await inputs.nth(1).fill('테스트 담당자');
    }
    
    // 전화번호 입력
    const phoneInput = modalContent.locator('input[type="tel"]');
    if (await phoneInput.count() > 0) {
      await phoneInput.first().waitFor({ state: 'visible', timeout: 5000 });
      await phoneInput.first().fill('010-1234-5678');
    }
    
    // 이메일 입력
    const emailInput = modalContent.locator('input[type="email"]');
    if (await emailInput.count() > 0) {
      await emailInput.first().waitFor({ state: 'visible', timeout: 5000 });
      await emailInput.first().fill('test@example.com');
    }
    
    // 상태 선택
    const statusSelect = modalContent.locator('select');
    if (await statusSelect.count() > 0) {
      await statusSelect.first().waitFor({ state: 'visible', timeout: 5000 });
      await statusSelect.first().selectOption('활성');
    }
    
    // 저장 버튼 클릭
    await page.getByRole('button', { name: '저장' }).click();
    
    // alert 다이얼로그 처리 대기
    await page.waitForTimeout(3000);
    
    // 모달이 닫혔는지 확인
    await expect(page.getByRole('heading', { name: '고객 추가' })).not.toBeVisible({ timeout: 10000 });
    
    // 목록이 업데이트될 때까지 대기 (페이지 새로고침 없이)
    // 테이블에 새 행이 나타날 때까지 기다림
    const row = page.locator('tr').filter({ hasText: testClientName });
    await expect(row).toBeVisible({ timeout: 15000 });

    // 수정 버튼 클릭하여 편집 모달 열기
    await row.getByRole('button', { name: '수정' }).click();
    await page.waitForTimeout(1000);

    // 삭제 버튼 클릭 (confirm 다이얼로그 처리)
    const deleteButton = page.getByRole('button', { name: '삭제' });
    await expect(deleteButton).toBeVisible();
    
    deleteButton.click();
    
    // confirm 다이얼로그 처리 대기
    await page.waitForTimeout(3000);
    
    // 모달이 닫혔는지 확인
    await expect(page.getByRole('heading', { name: '고객 정보 수정' })).not.toBeVisible({ timeout: 10000 });
    
    // 목록에서 삭제되었는지 확인 (페이지 새로고침 없이)
    const deletedRow = page.locator('tr').filter({ hasText: testClientName });
    await expect(deletedRow).not.toBeVisible({ timeout: 15000 });
  });

  test('2. 제품 관리 - 추가', async ({ page }) => {
    // alert 다이얼로그 리스너 설정
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // 제품 관리 탭 클릭
    await page.getByRole('link', { name: '제품 관리' }).click();
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
    const productModalContent = productModalHeading.locator('xpath=ancestor::div[contains(@class, "bg-white")]').first();
    await productModalContent.waitFor({ state: 'visible', timeout: 10000 });
    const nameInput = productModalContent.locator('input[type="text"]').first();
    await nameInput.waitFor({ state: 'visible', timeout: 10000 });
    await nameInput.fill(testProductName);
    
    // 종류 선택
    const typeSelect = productModalContent.locator('select').first();
    await typeSelect.waitFor({ state: 'visible', timeout: 5000 });
    await typeSelect.selectOption('제품');
    
    // 규격 입력
    const inputs = productModalContent.locator('input[type="text"]');
    if (await inputs.count() > 1) {
      await inputs.nth(1).waitFor({ state: 'visible', timeout: 5000 });
      await inputs.nth(1).fill('테스트 규격');
    }
    
    // 저장 버튼 클릭
    await page.getByRole('button', { name: '저장' }).click();
    
    // alert 다이얼로그 처리 대기
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

    // 먼저 고객과 제품이 있어야 하므로 추가
    // 고객 추가
    await page.getByRole('link', { name: '고객 관리' }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const addClientButton = page.getByRole('button').filter({ hasText: /고객 추가/ });
    await addClientButton.click();
    await page.waitForTimeout(500);
    
    const clientModalHeading = page.getByRole('heading', { name: '고객 추가' });
    await expect(clientModalHeading).toBeVisible();
    await page.waitForTimeout(1000);

    const clientModalContent = clientModalHeading.locator('xpath=ancestor::div[contains(@class, "bg-white")]').first();
    await clientModalContent.waitFor({ state: 'visible', timeout: 10000 });
    const companyInput = clientModalContent.locator('input[type="text"]').first();
    await companyInput.waitFor({ state: 'visible', timeout: 10000 });
    await companyInput.fill(testClientName);
    
    const statusSelect = clientModalContent.locator('select');
    if (await statusSelect.count() > 0) {
      await statusSelect.first().waitFor({ state: 'visible', timeout: 5000 });
      await statusSelect.first().selectOption('활성');
    }
    
    await page.getByRole('button', { name: '저장' }).click();
    await page.waitForTimeout(2000);

    // 제품 추가
    await page.getByRole('link', { name: '제품 관리' }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const addProductButton = page.getByRole('button').filter({ hasText: /제품 추가/ });
    await addProductButton.click();
    await page.waitForTimeout(500);
    
    const productModalHeading2 = page.getByRole('heading', { name: '제품 추가' });
    await expect(productModalHeading2).toBeVisible();
    await page.waitForTimeout(1000);

    const productModalContent2 = productModalHeading2.locator('xpath=ancestor::div[contains(@class, "bg-white")]').first();
    await productModalContent2.waitFor({ state: 'visible', timeout: 10000 });
    const nameInput2 = productModalContent2.locator('input[type="text"]').first();
    await nameInput2.waitFor({ state: 'visible', timeout: 10000 });
    await nameInput2.fill(testProductName);
    
    const typeSelect2 = productModalContent2.locator('select').first();
    await typeSelect2.waitFor({ state: 'visible', timeout: 5000 });
    await typeSelect2.selectOption('제품');
    
    await page.getByRole('button', { name: '저장' }).click();
    await page.waitForTimeout(2000);

    // 매출 관리 탭 클릭
    await page.getByRole('link', { name: '매출 관리' }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 매출 추가 버튼 클릭
    const addSaleButton = page.getByRole('button').filter({ hasText: /매출 추가/ });
    await addSaleButton.click();
    await page.waitForTimeout(500);
    
    const saleModalHeading = page.getByRole('heading', { name: '매출 추가' });
    await expect(saleModalHeading).toBeVisible();
    await page.waitForTimeout(1000);

    const saleModalContent = saleModalHeading.locator('xpath=ancestor::div[contains(@class, "bg-white")]').first();
    await saleModalContent.waitFor({ state: 'visible', timeout: 10000 });

    // 거래처 선택 (방금 추가한 고객 선택)
    const clientSelect = saleModalContent.locator('select').first();
    await clientSelect.waitFor({ state: 'visible', timeout: 10000 });
    // 옵션 목록에서 고객 이름이 포함된 옵션 찾기
    const clientOptions = await clientSelect.locator('option').all();
    let selectedIndex = -1;
    for (let i = 0; i < clientOptions.length; i++) {
      const text = await clientOptions[i].textContent();
      if (text && text.includes(testClientName)) {
        selectedIndex = i;
        break;
      }
    }
    if (selectedIndex >= 0) {
      await clientSelect.selectOption({ index: selectedIndex });
    } else {
      // 첫 번째 실제 거래처 선택 (index 1)
      await clientSelect.selectOption({ index: 1 });
    }
    await page.waitForTimeout(500);
    
    // 날짜 입력
    const today = new Date().toISOString().split('T')[0];
    const dateInput = saleModalContent.locator('input[type="date"]').first();
    await dateInput.waitFor({ state: 'visible', timeout: 5000 });
    await dateInput.fill(today);
    
    // 품목 섹션 찾기 (품목 1이 있는 div)
    const itemSection = saleModalContent.locator('div').filter({ hasText: /품목 1/ }).first();
    await itemSection.waitFor({ state: 'visible', timeout: 5000 });
    
    // 품목 선택 (품목 섹션 내의 select)
    const productSelect = itemSection.locator('select').first();
    await productSelect.waitFor({ state: 'visible', timeout: 5000 });
    // 옵션 목록에서 제품 이름이 포함된 옵션 찾기
    const productOptions = await productSelect.locator('option').all();
    let selectedProductIndex = -1;
    for (let i = 0; i < productOptions.length; i++) {
      const text = await productOptions[i].textContent();
      if (text && text.includes(testProductName)) {
        selectedProductIndex = i;
        break;
      }
    }
    if (selectedProductIndex >= 0) {
      await productSelect.selectOption({ index: selectedProductIndex });
    } else {
      // 첫 번째 제품 선택 (index 1)
      await productSelect.selectOption({ index: 1 });
    }
    await page.waitForTimeout(500);
    
    // 수량 입력
    const quantityInput = itemSection.locator('input[type="number"]').first();
    await quantityInput.waitFor({ state: 'visible', timeout: 5000 });
    await quantityInput.fill('10');
    
    // 단가 입력 (품목 섹션 내의 두 번째 number input)
    const unitPriceInput = itemSection.locator('input[type="number"]').nth(1);
    await unitPriceInput.waitFor({ state: 'visible', timeout: 5000 });
    await unitPriceInput.fill('10000');
    
    await page.waitForTimeout(1000);
    
    // 저장 버튼 클릭
    await page.getByRole('button', { name: '저장' }).click();
    
    // alert 다이얼로그 처리 대기
    await page.waitForTimeout(3000);
    
    // 모달이 닫혔는지 확인 (유효성 검증 실패 시 모달이 열려있을 수 있음)
    // 먼저 모달이 여전히 열려있는지 확인
    const isModalStillOpen = await page.getByRole('heading', { name: '매출 추가' }).isVisible().catch(() => false);
    
    if (isModalStillOpen) {
      // 모달이 여전히 열려있으면 에러 메시지 확인
      const errorText = await page.locator('text=/오류|에러|필수|선택/').first().textContent().catch(() => '');
      throw new Error(`매출 저장 실패: ${errorText || '알 수 없는 오류'}`);
    }
    
    // 모달이 닫혔는지 확인
    await expect(page.getByRole('heading', { name: '매출 추가' })).not.toBeVisible({ timeout: 5000 });
    
    // 목록이 업데이트될 때까지 대기
    const saleRow = page.locator('tr').filter({ hasText: testClientName });
    await expect(saleRow).toBeVisible({ timeout: 15000 });
  });

  test('4. 대시보드 - 숫자 표시 확인', async ({ page }) => {
    // 대시보드로 이동 (이미 beforeEach에서 이동했지만 명시적으로)
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // KPI 카드들이 표시되는지 확인
    await expect(page.getByText(/총 고객/)).toBeVisible();
    await expect(page.getByText(/이번 달 매출/)).toBeVisible();
    await expect(page.getByText(/진행 중 영업/)).toBeVisible();
    await expect(page.getByText(/이번 달 활동/)).toBeVisible();

    // 숫자가 표시되는지 확인 (정규식으로 숫자 패턴 확인)
    const totalClients = page.locator('text=/총 고객/').locator('..').locator('text=/\\d+명/');
    await expect(totalClients.first()).toBeVisible({ timeout: 5000 });

    // 차트 제목 확인
    await expect(page.getByText('이번 달 주간 매출 추이')).toBeVisible();
    
    // 최근 영업 활동 섹션 확인
    await expect(page.getByText('최근 영업 활동')).toBeVisible();
  });

  // afterAll 제거 - page fixture를 사용할 수 없으므로
});

