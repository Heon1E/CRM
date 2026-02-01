// 거래처 일괄 등록용 양식 다운로드
export const downloadClientTemplate = () => {
  const data = [
    {
      회사명: '',
      담당자1: '',
      전화번호: '',
      이메일: '',
      상태: '',
    },
  ]

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '거래처 목록')

  // 컬럼 너비 설정
  ws['!cols'] = [
    { wch: 25 }, // 회사명
    { wch: 20 }, // 담당자1
    { wch: 18 }, // 전화번호
    { wch: 25 }, // 이메일
    { wch: 12 }, // 상태
  ]

  const fileName = '거래처_일괄등록_양식.xlsx'
  XLSX.writeFile(wb, fileName)
}
