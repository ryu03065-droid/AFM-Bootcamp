# AFM Bootcamp

AI + 프론트엔드 + 서버를 함께 배우는 부트캠프 실습 저장소입니다.

---

## Week 2 — 프론트엔드 & API 연동

순수 HTML/CSS/JS로 다양한 웹 앱을 만들고, 외부 API와 브라우저 기능을 활용하는 실습입니다.

### 실습

| 프로젝트 | 경로 | 설명 |
|---|---|---|
| ASMR Ambient Mixer | `week-2/01/asmr-meditation.html` | Web Audio API로 빗소리·파도 등 백색소음 믹서 |
| Canvas 드로잉 | `week-2/02/` | Canvas API 기반 인터랙티브 드로잉 |
| Fetch 실습 | `week-2/03/`, `week-2/04/` | 외부 API fetch 기초 실습 |

### 숙제

| 프로젝트 | 경로 | 설명 |
|---|---|---|
| 더치페이 계산기 | `week-2/homework/dutch-pay-calculator.html` | 인원·금액 입력 → 1/n 정산 계산 |
| 한국 세금 계산기 | `week-2/homework/tax-calculator.html` | 소득세·4대보험 자동 계산 |
| PDF 변환기 | `week-2/homework/pdf-generator.html` | 텍스트/이미지를 PDF로 변환·다운로드 |
| QR 코드 생성기 | `week-2/homework/qr-generator.html` | URL 입력 → QR 코드 즉시 생성 |
| 짤 생성기 | `week-2/homework/meme-maker.html` | 이미지에 텍스트를 올려 밈 제작 |

---

## Week 3 — Node.js 서버 + AI API 연동

Express/HTTP 서버를 직접 만들고, OpenAI·외부 날씨 API 등을 **서버 사이드**에서 호출하는 실습입니다.

### 실습 — Node.js 서버 기초

| 프로젝트 | 경로 | 설명 |
|---|---|---|
| 웹서버 01 | `week-3/webserver-01/` | Node.js http 모듈로 정적 HTML 서빙 |
| 웹서버 02 | `week-3/webserver-02/` | 라우팅 + JSON API 응답 |
| 웹서버 03 | `week-3/webserver-03/` | 파일 시스템 읽기 + 비밀번호 API |

### 퀘스트 — 외부 API 연동

| 프로젝트 | 경로 | 설명 |
|---|---|---|
| NASA APOD | `week-3/nasa-apod/nasa-apod.html` | NASA 오늘의 천문 사진 API 연동, 날짜 선택 |
| 오늘의 날씨 | `week-3/weather-today/weather-today.html` | 위치 기반 현재 날씨 표시 |
| 포켓몬 도감 | `week-3/pokebook/` | PokéAPI 연동 전국도감, 검색·필터 |

### 숙제 — 서버 + AI 앱

| 프로젝트 | 경로 | 핵심 기술 | 설명 |
|---|---|---|---|
| 실시간 코인 대시보드 | `week-3/homework/coin-dashboard/` | 외부 API | 실시간 암호화폐 시세 조회 및 시각화 |
| AI 별명 생성기 | `week-3/homework/nickname-generator/` | Node 서버 + Groq API | 특징 입력 → AI가 별명 생성 |
| 직장인 고민 상담 챗봇 | `week-3/homework/my-chatgpt/` | Node 서버 + OpenAI | 공감형 AI 상담사 캐릭터 챗봇 |
| AI 이미지 생성기 | `week-3/homework/ai-image-generator/` | Node 서버 + OpenAI DALL·E | 텍스트 프롬프트 → AI 이미지 생성 |
| 🔮 AI 꿈 해몽 | `week-3/homework/dream-interpreter/` | Node 서버 + OpenAI | 꿈 내용 입력 → 길흉·행운지수·조언 반환 |
| 👗 날씨 옷차림 추천 | `week-3/homework/weather-outfit/` | Express + OpenWeatherMap | 도시 선택 → 실시간 날씨 기반 옷차림 추천 |

---

## 주요 앱 실행 방법

### AI 꿈 해몽 (`dream-interpreter`)

```bash
cd week-3/homework/dream-interpreter
OPENAI_API_KEY=your_key node server.js
# → http://localhost:3000
```

- 꿈 내용 입력 → 길몽/흉몽/중립몽 + 행운지수(0~100) + 상징 키워드 + 해몽 + 오늘의 조언

### 날씨 옷차림 추천 (`weather-outfit`)

```bash
cd week-3/homework/weather-outfit
# .env 파일에 OPENWEATHER_API_KEY 입력 후:
node server.js
# → http://localhost:3000
```

- 서울·부산·제주·도쿄·뉴욕 선택 → OpenWeatherMap 실시간 날씨 → 체감온도 기준 옷차림 추천

---

## 기술 스택

| 구분 | 기술 |
|---|---|
| 프론트엔드 | HTML / CSS / JavaScript, React 18 (CDN), Tailwind CSS |
| 백엔드 | Node.js, Express.js |
| AI API | OpenAI (GPT-4o-mini, DALL·E), Groq |
| 날씨 API | OpenWeatherMap |
| 기타 | NASA APOD API, PokéAPI, CoinGecko API |

---

## 학습 포인트

- **Week 2**: 브라우저 API(Canvas, Web Audio, Fetch), 외부 라이브러리 CDN 활용
- **Week 3**: Node.js HTTP/Express 서버 구축, **API 키를 서버에 숨기는 이유와 방법** (`.env` + `dotenv`), AI 시스템 프롬프트로 캐릭터·출력 형식 설계
