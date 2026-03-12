# ApplyFlow — AI 기반 모집·심사 시스템

AI 대화형 인터페이스로 신청을 받고, AI 블라인드 심사로 공정하게 선발하는 범용 모집 시스템.

## 주요 기능

- **AI 대화형 신청 폼**: 채팅처럼 단계별로 질문에 답하는 UX
- **AI 블라인드 심사**: 개인정보 없이 내용만으로 평가 (공정성 보장)
- **문항 설계 AI 지원**: 관리자가 AI와 대화하며 신청 질문 설계
- **결과 리뷰 AI 대화**: AI와 심사 결과를 논의하며 최종 결정
- **이메일 자동 발송**: 합격/불합격 이메일 템플릿 + 일괄 발송
- **범용 설계**: 설정만 바꾸면 다른 모집에도 재사용 가능

## 아키텍처

```
프론트엔드 (GitHub Pages)     백엔드 (Google Apps Script)     DB (Google Sheets)
├── index.html (신청)    →    ├── doPost() 데이터 저장    →   ├── 설정 시트
├── admin.html (관리)    →    ├── chatWithAI() AI 프록시  →   ├── 신청 시트
├── css/style.css             ├── blindReview() 심사      →   └── 심사 시트
└── js/*.js                   └── sendEmail() 이메일
```

## 시작하기

### 1. 프론트엔드 배포

```bash
# GitHub 레포 생성 후
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/greatsong/apply-flow.git
git push -u origin main
# GitHub Settings > Pages > main branch 활성화
```

### 2. 백엔드 설정

`apps-script/setup-guide.md`의 상세 가이드를 따라주세요.

요약:
1. Google Sheets 생성
2. Apps Script에 `Code.gs` 붙여넣기
3. 스크립트 속성에 `ANTHROPIC_API_KEY` 설정
4. `initialSetup()` 실행
5. 웹 앱으로 배포
6. 프론트엔드에 URL 연결

## 프로세스 흐름

```
Phase 1: 문항 설계    관리자가 AI와 대화하며 질문 설계 + 심사 기준 설정
    ↓
Phase 2: 신청 수집    신청자가 대화형 폼으로 지원서 작성
    ↓
Phase 3: AI 심사      블라인드 데이터로 AI가 평가 (개인정보 제외)
    ↓
Phase 4: 결과 리뷰    관리자가 AI와 결과 논의 + 최종 선발
    ↓
Phase 5: 이메일 발송  합격/불합격 이메일 자동 전송
```

## AI 블라인드 원칙

AI는 다음 정보를 **볼 수 없습니다**:
- 이름, 이메일, 소속, 과목

AI는 다음만 평가합니다:
- 교재 주제, 전문성 소개, 목차 초안, 샘플 챕터 내용
- 각 신청자는 "지원자 #1", "지원자 #2"로 익명화

## 기술 스택

- **프론트엔드**: HTML, CSS, Vanilla JS, Tailwind-inspired custom CSS
- **백엔드**: Google Apps Script
- **AI**: Anthropic Claude API (claude-sonnet-4-6)
- **데이터**: Google Sheets
- **이메일**: Gmail (GmailApp)
- **폰트**: Pretendard Variable

## 파일 구조

```
apply-flow/
├── index.html              # 신청 페이지
├── admin.html              # 관리자 페이지
├── css/style.css           # 디자인 시스템
├── js/
│   ├── app.js              # 신청 로직
│   ├── admin.js            # 관리자 로직
│   └── chat-ui.js          # 공용 채팅 UI
├── apps-script/
│   ├── Code.gs             # Apps Script 코드
│   └── setup-guide.md      # 설정 가이드
└── README.md
```

## 제작

석리송 · [EduFlow](https://eduflow-greatsong.fly.dev)
