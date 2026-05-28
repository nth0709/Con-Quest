# ConQuest

## 2026-05-28 실행 안내

### 프론트 실행

```powershell
cd C:\devo\Con-Quest-main
cmd /c npm run dev
```

앱 주소: http://localhost:5173

### 백엔드 실행

```powershell
cd C:\devo\Con-Quest-main\backend
python -m uvicorn main:app --port 8000
```

백엔드 확인 주소: http://127.0.0.1:8000/docs

### 공모전 최신 크롤링

```powershell
cd C:\devo\Con-Quest-main
python crawler.py
```

생성/갱신 파일:

- `contests.csv`
- `src/data/contests.json`
- `backend/data/contests.json`
- `backend/data/sample_contests.json`

최신 반영 결과:

- 링커리어: 87개
- 위비티: 212개
- 씽굿: 30개
- 전체: 329개

백엔드는 실행 중인 상태에서 코드가 바뀌면 자동 반영되지 않습니다. 백엔드 수정 후에는 터미널에서 `Ctrl + C`로 끄고 위 백엔드 실행 명령어를 다시 실행하세요.

ConQuest는 `React + Vite` 프론트엔드와 `FastAPI` 백엔드를 함께 사용하는 프로젝트입니다.

## 이번 반영 내용

- 회원가입 순서를 `이름 -> 닉네임 -> 아이디/비밀번호 -> 기본정보`로 조정
- 모든 주요 페이지 하단에 공통 `BottomNavigation` 추가
- 공모전 상세 페이지의 뒤로가기 동작을 이전 화면 복귀 방식으로 유지
- 공모전 목록 카드를 실제 서비스형 카드 구조로 개선
- 공모전 상세 페이지에 큰 이미지, 상세 정보, 공식 홈페이지 버튼 추가
- `crawler.py`를 개선해 링커리어, 위비티, 씽굿 데이터를 `CSV + JSON`으로 저장
- 기존 필드를 유지하면서 아래 데이터 필드 추가
  - `imageUrl`
  - `thumbnailUrl`
  - `officialLink`
  - `recruitmentPeriod`
  - `activityPeriod`
  - `recruitmentCount`
  - `recruitCount`
  - `activityRegion`
  - `region`
  - `participationTarget`
  - `target`
  - `category`
  - `benefits`
  - `prize`

## 프론트 실행

```bash
npm install
npm run dev
```

기본 주소:

- `http://localhost:5173`

## 백엔드 실행

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

기본 주소:

- `http://localhost:8000`

## 크롤링 실행

프로젝트 루트에서 실행:

```bash
python crawler.py
```

생성 파일:

- `contests.csv`
- `src/data/contests.json`
- `backend/data/contests.json`

기본 수집 범위:

- 링커리어: 최근 5페이지
- 위비티: 목록 3페이지, 카테고리 최대 3개
- 씽굿: 목록 5페이지

필요하면 환경변수로 범위를 늘릴 수 있습니다.

```bash
LINKAREER_MAX_PAGES=8
WEVITY_MAX_PAGES=4
WEVITY_MAX_CATEGORIES=5
THINKGOOD_MAX_PAGES=10
python crawler.py
```

Windows PowerShell 예시:

```powershell
$env:LINKAREER_MAX_PAGES='8'
$env:WEVITY_MAX_PAGES='4'
$env:WEVITY_MAX_CATEGORIES='5'
$env:THINKGOOD_MAX_PAGES='10'
python crawler.py
```

## 데이터 반영 구조

- 프론트 fallback 데이터: `src/data/contests.json`
- 프론트 매핑 파일: `src/data/contestsData.js`
- 백엔드 seed 데이터: `backend/data/contests.json`
- 백엔드 seed 로더: `backend/app/contest_data.py`

## 참고

- 크롤러는 기본적으로 `requests + BeautifulSoup`를 사용합니다.
- 씽굿은 목록 렌더링 특성상 `selenium` headless Chrome을 함께 사용합니다.
- 한 사이트 수집이 실패하더라도 기존 `contests.json`의 해당 소스 데이터를 fallback으로 재사용합니다.
- OneDrive 경로에서는 `Vite/Tailwind` 네이티브 모듈이나 `SQLite disk I/O error`가 발생할 수 있습니다.
- 실행이 불안정하면 프로젝트를 `C:\dev\conquest` 같은 OneDrive 바깥 경로로 옮겨 실행하는 것을 권장합니다.
