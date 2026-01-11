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
      단가: '',
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
    { wch: 15 }, // 단가
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
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet)

        // 데이터 변환 및 검증
        const products = jsonData
          .map((row, index) => {
            const name = row['품목명'] || row['name'] || ''
            const type = row['종류'] || row['type'] || ''
            const standard = row['규격'] || row['standard'] || ''
            const price = row['단가'] || row['price'] || 0

            // 필수 필드 검증
            if (!name || !name.trim()) {
              return null // 빈 행은 제외
            }

            return {
              name: name.trim(),
              type: type.trim() || '',
              standard: standard.trim() || '',
              price: typeof price === 'number' ? price : parseFloat(price) || 0,
              rowIndex: index + 2, // 엑셀 행 번호 (헤더 제외)
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
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet)

        // 데이터 변환 및 검증
        const clients = jsonData
          .map((row, index) => {
            const company = row['회사명'] || row['company'] || ''
            const contact1Name = row['담당자1'] || row['담당자1_이름'] || row['contact1'] || ''
            const contact1Role = row['담당자1_직책'] || row['담당자1_부서'] || row['contact1_role'] || ''
            const contact1Phone = row['담당자1_전화번호'] || row['담당자1_연락처'] || row['contact1_phone'] || ''
            const contact1Email = row['담당자1_이메일'] || row['담당자1_메일'] || row['contact1_email'] || ''
            const status = row['상태'] || row['status'] || '신규'

            // 필수 필드 검증: 회사명과 담당자1 이름은 필수
            if (!company || !company.trim()) {
              return null // 빈 행은 제외
            }

            if (!contact1Name || !contact1Name.trim()) {
              throw new Error(`${index + 2}번째 행: 담당자1 이름이 필수입니다.`)
            }

            // 자동 연동 필드 제외 (last_order, order_amount)
            // DB 스키마에 맞는 컬럼명 사용 (snake_case)
            return {
              company: company.trim(),
              status: status.trim() || '신규',
              contacts: [
                {
                  name: contact1Name.trim(),
                  department_role: (contact1Role || '').trim(),
                  phone: (contact1Phone || '').trim(),
                  email: (contact1Email || '').trim(),
                  is_primary: true, // 첫 번째 담당자를 키맨으로 자동 설정
                },
              ],
              rowIndex: index + 2, // 엑셀 행 번호 (헤더 제외)
            }
          })
          .filter((client) => client !== null) // null 제거

        if (clients.length === 0) {
          reject(new Error('등록할 거래처 데이터가 없습니다. 엑셀 파일을 확인해주세요.'))
          return
        }

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
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet)

        // 데이터 변환 및 검증
        const salesData = []
        
        jsonData.forEach((row, index) => {
          const saleDate = row['날짜'] || row['date'] || row['sale_date'] || ''
          const clientName = row['거래처'] || row['client'] || row['clientName'] || ''
          const itemName = row['품목명'] || row['item'] || row['item_name'] || ''
          const quantity = row['수량'] || row['quantity'] || 0
          const unitPrice = row['단가'] || row['unit_price'] || row['price'] || 0
          const notes = row['비고'] || row['notes'] || ''

          // 필수 필드 검증: 날짜, 거래처, 품목명은 필수
          if (!saleDate || !saleDate.trim()) {
            return // 빈 행은 제외
          }

          if (!clientName || !clientName.trim()) {
            throw new Error(`${index + 2}번째 행: 거래처가 필수입니다.`)
          }

          if (!itemName || !itemName.trim()) {
            throw new Error(`${index + 2}번째 행: 품목명이 필수입니다.`)
          }

          salesData.push({
            sale_date: saleDate.trim(),
            clientName: clientName.trim(),
            item_name: itemName.trim(),
            quantity: Number(quantity) || 1,
            unitPrice: Number(unitPrice) || 0,
            notes: notes.trim() || '',
            rowIndex: index + 2, // 엑셀 행 번호 (헤더 제외)
          })
        })

        if (salesData.length === 0) {
          reject(new Error('등록할 매출 데이터가 없습니다. 엑셀 파일을 확인해주세요.'))
          return
        }

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
