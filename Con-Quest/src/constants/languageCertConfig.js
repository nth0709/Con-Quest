/** 어학·점수형 자격증: 선택 시 추가 입력 UI 조건 */
export const LANGUAGE_CERT_CONFIG = {
  TOEIC: { type: 'score', min: 0, max: 990, placeholder: '점수 입력 (0~990)' },
  'TOEIC Speaking': { type: 'grade', options: ['AH', 'AM', 'AL', 'IH', 'IM', 'IL', 'NH', 'NM', 'NL'] },
  OPIc: { type: 'grade', options: ['AL', 'IH', 'IM3', 'IM2', 'IM1', 'IL', 'NH', 'NM', 'NL'] },
  TOEFL: { type: 'score', min: 0, max: 120, placeholder: '점수 입력 (0~120)' },
  TEPS: { type: 'score', min: 0, max: 600, placeholder: '점수 입력 (0~600)' },
  'G-TELP': { type: 'score', min: 0, max: 100, placeholder: '점수 입력 (0~100)' },
  'HSK (중국어)': { type: 'grade', options: ['6급', '5급', '4급', '3급', '2급', '1급'] },
  'JLPT (일본어)': { type: 'grade', options: ['N1', 'N2', 'N3', 'N4', 'N5'] },
  'JPT (일본어)': { type: 'score', min: 10, max: 990, placeholder: '점수 입력 (10~990)' },
  'DELF/DALF (프랑스어)': { type: 'grade', options: ['C2', 'C1', 'B2', 'B1', 'A2', 'A1'] },
  'Goethe-Zertifikat (독일어)': { type: 'grade', options: ['C2', 'C1', 'B2', 'B1', 'A2', 'A1'] },
  'DELE (스페인어)': { type: 'grade', options: ['C2', 'C1', 'B2', 'B1', 'A2', 'A1'] },
  'TORFL (러시아어)': { type: 'grade', options: ['4단계', '3단계', '2단계', '1단계', '기본단계', '기초단계'] },
}
