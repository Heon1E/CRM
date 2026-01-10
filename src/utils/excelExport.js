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

