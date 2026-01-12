import * as XLSX from 'xlsx'

export const exportClientsToExcel = (clients) => {
  const data = clients.map((client) => ({
    회사명: client.company,
    담당자: client.contact_person || '',
    전화번호: client.phone,
    이메일: client.email,
    상태: client.status,
    최근주문일: client.lastOrder,
    주문금액: `${(client.orderAmount / 10000).toLocaleString()}만원`,
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '고객 목록')

  const fileName = `고객목록_${new Date().toISOString().split('T')[0]}.xlsx`
  XLSX.writeFile(wb, fileName)
}

export const exportActivitiesToExcel = (activities) => {
  const data = activities.map((activity) => ({
    날짜: activity.activity_date || activity.date,
    담당자: activity.user,
    활동유형: activity.type,
    고객사: activity.clientName,
    내용: activity.description,
    상태: activity.status,
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '영업 활동')

  const fileName = `영업활동_${new Date().toISOString().split('T')[0]}.xlsx`
  XLSX.writeFile(wb, fileName)
}

export const exportSalesToExcel = (sales) => {
  const data = sales.map((sale) => ({
    날짜: sale.date || sale.sale_date,
    거래처: sale.clientName,
    품목수: sale.items.length,
    대표품목: sale.items.length > 0 ? sale.items[0].productName : '',
    총매출액: `${(sale.totalAmount / 10000).toLocaleString()}만원`,
    비고: sale.notes || '',
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '매출 목록')

  const fileName = `매출목록_${new Date().toISOString().split('T')[0]}.xlsx`
  XLSX.writeFile(wb, fileName)
}

// 제품 일괄 등록용 양식 다운로드
export const downloadProductTemplate = () => {
  const data = [
    {
      품목명: '',
      종류: '',
      규격: '',
    },
  ]

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '제품 목록')

  // 컬럼 너비 설정
  ws['!cols'] = [
    { wch: 20 }, // 품목명
    { wch: 15 }, // 종류
    { wch: 20 }, // 규격
  ]

  const fileName = `제품등록양식_${new Date().toISOString().split('T')[0]}.xlsx`
  XLSX.writeFile(wb, fileName)
}

// 엑셀 파일 파싱하여 제품 데이터 추출
export const parseProductExcel = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        // UTF-8 인코딩 명시적으로 설정
        const workbook = XLSX.read(data, { type: 'array', codepage: 65001 })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        // UTF-8로 한글 컬럼명 정확히 읽기
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' })

        // 데이터 변환 및 검증
        const products = jsonData
          .map((row, index) => {
            // 다양한 한글 컬럼명 변형 지원 (UTF-8 인코딩 보장) - null/undefined 안전 처리
            const name = ((row['품목명'] || row['제품명'] || row['name'] || row['product_name'] || row['Name'] || row['NAME'] || row['Product'] || row['PRODUCT'] || '') || '').toString().trim()
            const type = ((row['종류'] || row['type'] || row['category'] || row['Type'] || row['TYPE'] || row['Category'] || row['CATEGORY'] || '') || '').toString().trim()
            const standard = ((row['규격'] || row['standard'] || row['spec'] || row['Standard'] || row['STANDARD'] || row['Spec'] || row['SPEC'] || '') || '').toString().trim()

            // 필수 필드 검증: 제품명만 필수 (종류, 규격은 선택사항)
            if (!name || name === '') {
              return null // 빈 행은 제외
            }

            return {
              name: name,
              type: type || '', // 비어있어도 등록 가능
              standard: standard || '', // 비어있어도 등록 가능
              rowIndex: index + 2, // 엑셀 행 번호 (헤더 제외) - DB 전송 전 제거됨
            }
          })
          .filter((product) => product !== null) // null 제거

        resolve(products)
      } catch (error) {
        reject(new Error(`엑셀 파일 파싱 중 오류가 발생했습니다: ${error.message}`))
      }
    }

    reader.onerror = () => {
      reject(new Error('파일 읽기 중 오류가 발생했습니다.'))
    }

    reader.readAsArrayBuffer(file)
  })
}

// 거래처 일괄 등록용 양식 다운로드
export const downloadClientTemplate = () => {
  const data = [
    {
      회사명: '',
      담당자1: '',
      담당자1_직책: '',
      담당자1_전화번호: '',
      담당자1_이메일: '',
      상태: '신규',
    },
  ]

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '거래처 목록')

  // 컬럼 너비 설정
  ws['!cols'] = [
    { wch: 25 }, // 회사명
    { wch: 20 }, // 담당자1
    { wch: 15 }, // 담당자1_직책
    { wch: 18 }, // 담당자1_전화번호
    { wch: 25 }, // 담당자1_이메일
    { wch: 12 }, // 상태
  ]

  const fileName = '거래처_일괄등록_양식.xlsx'
  XLSX.writeFile(wb, fileName)
}

// 엑셀 파일 파싱하여 거래처 데이터 추출
export const parseClientExcel = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        // UTF-8 인코딩 명시적으로 설정
        const workbook = XLSX.read(data, { type: 'array', codepage: 65001 })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        // UTF-8로 한글 컬럼명 정확히 읽기
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' })

        // 데이터 변환 및 검증
        const clients = jsonData
          .map((row, index) => {
            // 다양한 한글 컬럼명 변형 지원 (UTF-8 인코딩 보장) - null/undefined 안전 처리
            const company = ((row['회사명'] || row['company'] || row['회사'] || row['Company'] || row['COMPANY'] || '') || '').toString().trim()
            const contact1Name = ((row['담당자1'] || row['담당자1_이름'] || row['담당자'] || row['contact1'] || row['Contact'] || row['CONTACT'] || '') || '').toString().trim()
            const contact1Role = ((row['담당자1_직책'] || row['담당자1_부서'] || row['직책'] || row['contact1_role'] || row['Role'] || row['ROLE'] || '') || '').toString().trim()
            const contact1Phone = ((row['담당자1_전화번호'] || row['담당자1_연락처'] || row['전화번호'] || row['연락처'] || row['contact1_phone'] || row['Phone'] || row['PHONE'] || '') || '').toString().trim()
            const contact1Email = ((row['담당자1_이메일'] || row['담당자1_메일'] || row['이메일'] || row['email'] || row['contact1_email'] || row['Email'] || row['EMAIL'] || '') || '').toString().trim()
            const status = ((row['상태'] || row['status'] || row['Status'] || row['STATUS'] || '신규') || '신규').toString().trim()

            // 필수 필드 검증: 회사명만 필수 (담당자 정보는 선택사항)
            if (!company || company === '') {
              return null // 빈 행은 제외
            }

            // 담당자 정보가 있으면 contacts 배열에 추가, 없으면 빈 배열
            const contacts = []
            if (contact1Name && contact1Name !== '') {
              contacts.push({
                name: contact1Name,
                department_role: contact1Role || '',
                phone: contact1Phone || '',
                email: contact1Email || '',
                is_primary: true, // 첫 번째 담당자를 키맨으로 자동 설정
              })
            }

            // 자동 연동 필드 제외 (last_order, order_amount)
            // DB 스키마에 맞는 컬럼명 사용 (snake_case)
            return {
              company: company,
              status: status || '신규',
              contacts: contacts, // 담당자 정보가 없어도 빈 배열로 등록 가능
              rowIndex: index + 2, // 엑셀 행 번호 (헤더 제외)
            }
          })
          .filter((client) => client !== null) // null 제거

        // 회사명이 있는 데이터만 필터링 (회사명이 없으면 null로 반환되어 이미 필터링됨)
        // clients.length === 0 체크는 제거 (회사명이 없으면 null 반환되어 필터링되므로)
        resolve(clients)
      } catch (error) {
        reject(new Error(`엑셀 파일 파싱 중 오류가 발생했습니다: ${error.message}`))
      }
    }

    reader.onerror = () => {
      reject(new Error('파일 읽기 중 오류가 발생했습니다.'))
    }

    reader.readAsArrayBuffer(file)
  })
}

// 매출 일괄 등록용 양식 다운로드
export const downloadSaleTemplate = () => {
  const data = [
    {
      날짜: '',
      거래처: '',
      품목명: '',
      수량: '',
      단가: '',
      비고: '',
    },
  ]

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '매출 목록')

  // 컬럼 너비 설정
  ws['!cols'] = [
    { wch: 15 }, // 날짜
    { wch: 25 }, // 거래처
    { wch: 25 }, // 품목명
    { wch: 12 }, // 수량
    { wch: 15 }, // 단가
    { wch: 30 }, // 비고
  ]

  const fileName = '매출_일괄등록_양식.xlsx'
  XLSX.writeFile(wb, fileName)
}

// 엑셀 파일 파싱하여 매출 데이터 추출
export const parseSaleExcel = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        // UTF-8 인코딩 명시적으로 설정
        const workbook = XLSX.read(data, { type: 'array', codepage: 65001 })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        // UTF-8로 한글 컬럼명 정확히 읽기
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' })

        // 데이터 변환 및 검증
        const salesData = []
        
        jsonData.forEach((row, index) => {
          // 다양한 한글 컬럼명 변형 지원 (UTF-8 인코딩 보장) - null/undefined 안전 처리
          const saleDate = ((row['날짜'] || row['판매날짜'] || row['매출일'] || row['date'] || row['sale_date'] || row['Date'] || row['DATE'] || row['SaleDate'] || row['SALE_DATE'] || '') || '').toString().trim()
          const clientName = ((row['거래처'] || row['거래처명'] || row['회사명'] || row['client'] || row['clientName'] || row['Client'] || row['CLIENT'] || row['Company'] || row['COMPANY'] || '') || '').toString().trim()
          const itemName = ((row['품목명'] || row['제품명'] || row['item'] || row['item_name'] || row['product_name'] || row['Item'] || row['ITEM'] || row['Product'] || row['PRODUCT'] || '') || '').toString().trim()
          const quantityValue = row['수량'] || row['quantity'] || row['Quantity'] || row['QUANTITY'] || 0
          const quantity = typeof quantityValue === 'number' ? quantityValue : (quantityValue ? parseFloat(quantityValue) : 1) || 1
          const unitPriceValue = row['단가'] || row['unit_price'] || row['price'] || row['Price'] || row['PRICE'] || row['UnitPrice'] || row['UNIT_PRICE'] || 0
          const unitPrice = typeof unitPriceValue === 'number' ? unitPriceValue : (unitPriceValue ? parseFloat(unitPriceValue) : 0) || 0
          const notes = ((row['비고'] || row['notes'] || row['메모'] || row['Notes'] || row['NOTES'] || row['Memo'] || row['MEMO'] || '') || '').toString().trim()

          // 필수 필드 검증: 거래처명과 매출일만 필수 (품목명, 비고는 선택사항)
          if (!saleDate || saleDate === '') {
            return // 빈 행은 제외
          }

          if (!clientName || clientName === '') {
            return // 거래처명이 없으면 해당 행 건너뛰기 (에러 대신 무시)
          }

          // 품목명이 없어도 등록 가능 (기본값: 빈 문자열)
          salesData.push({
            sale_date: saleDate,
            clientName: clientName,
            item_name: itemName || '', // 품목명이 없어도 등록 가능
            quantity: quantity,
            unitPrice: unitPrice,
            notes: notes || '', // 비고가 없어도 등록 가능
            rowIndex: index + 2, // 엑셀 행 번호 (헤더 제외)
          })
        })

        // 거래처명과 판매일이 있는 데이터만 필터링 (없으면 return으로 건너뛰어짐)
        // salesData.length === 0 체크는 제거 (데이터가 없어도 빈 배열 반환)
        resolve(salesData)
      } catch (error) {
        reject(new Error(`엑셀 파일 파싱 중 오류가 발생했습니다: ${error.message}`))
      }
    }

    reader.onerror = () => {
      reject(new Error('파일 읽기 중 오류가 발생했습니다.'))
    }

    reader.readAsArrayBuffer(file)
  })
}
