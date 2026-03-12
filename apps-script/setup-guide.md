# Google Apps Script 설정 가이드

## 1단계: Google Sheets 생성

1. [Google Sheets](https://sheets.google.com)에서 새 스프레드시트 생성
2. 스프레드시트 이름: `ApplyFlow - 에듀플로 베타 테스터`
3. 스프레드시트 ID 메모 (URL에서 `/d/` 뒤의 문자열)

## 2단계: Apps Script 프로젝트 생성

1. 스프레드시트에서 **확장 프로그램 > Apps Script** 클릭
2. 기존 `Code.gs` 내용을 삭제
3. `apps-script/Code.gs` 파일의 전체 내용을 붙여넣기
4. **저장** (Ctrl+S)

## 3단계: 스크립트 속성 설정

1. Apps Script 에디터에서 **프로젝트 설정** (톱니바퀴 아이콘) 클릭
2. 하단의 **스크립트 속성** 섹션에서 다음 추가:

| 속성 | 값 |
|------|-----|
| `ANTHROPIC_API_KEY` | 본인의 Anthropic API 키 |
| `SPREADSHEET_ID` | 1단계에서 메모한 스프레드시트 ID |

## 4단계: 초기 설정 실행

1. Apps Script 에디터에서 함수 선택 드롭다운 → `initialSetup` 선택
2. **실행** 버튼 클릭
3. 권한 요청이 나타나면 **허용**
4. 실행 로그에서 "초기 설정 완료" 확인
5. 스프레드시트에 3개 시트(설정, 신청, 심사)가 생성되었는지 확인

## 5단계: 관리자 비밀번호 설정

1. 함수 선택 → `setAdminPassword` 선택
2. 실행하면 프롬프트에서 비밀번호 입력 (또는 코드에서 직접 설정)

**또는** Apps Script 콘솔에서 직접:
```javascript
function setMyPassword() {
  setAdminPassword('원하는비밀번호');
}
```
이 함수를 만들고 실행합니다.

## 6단계: 웹 앱으로 배포

1. Apps Script 에디터에서 **배포 > 새 배포**
2. 유형: **웹 앱** 선택
3. 설정:
   - 설명: "ApplyFlow Backend"
   - 실행 사용자: **나**
   - 액세스 권한: **모든 사용자**
4. **배포** 클릭
5. 웹 앱 URL 복사 (예: `https://script.google.com/macros/s/xxxxx/exec`)

## 7단계: 프론트엔드에 URL 연결

### 방법 A: 코드에 직접 입력
1. `js/app.js` 파일 상단의 `APPS_SCRIPT_URL` 변수에 URL 입력
2. `js/admin.js` 파일도 동일하게 설정

### 방법 B: 관리자 페이지에서 설정
1. `admin.html` 접속
2. 좌측 하단 ⚙️ **설정** 클릭
3. Apps Script URL 입력 + 저장

## 8단계: 테스트

1. 신청 페이지(index.html)에서 테스트 데이터 제출
2. Google Sheets "신청" 시트에 데이터가 들어왔는지 확인
3. 관리자 페이지에서 로그인 → 신청 현황 확인
4. AI 심사 실행 → 결과 확인
5. 이메일 발송 테스트 (본인 이메일로)

## 주의사항

- Apps Script 웹 앱 URL이 변경되면 프론트엔드도 업데이트 필요
- 배포를 수정할 때는 **새 배포**가 아닌 **배포 관리 > 수정**으로 해야 URL 유지
- API 키는 절대 프론트엔드 코드에 포함하지 마세요
- Apps Script의 실행 시간 제한은 6분입니다 (대량 심사 시 참고)

## 트러블슈팅

### CORS 오류 발생 시
- Apps Script 응답에 CORS 헤더가 포함되어 있는지 확인
- `mode: 'no-cors'` 사용 시 응답을 읽을 수 없는 것이 정상

### AI 심사가 실패하는 경우
- `ANTHROPIC_API_KEY`가 올바르게 설정되었는지 확인
- Apps Script 실행 로그에서 에러 메시지 확인
- API 크레딧 잔액 확인

### 이메일 발송 한도
- Gmail은 하루 100통 제한 (Google Workspace는 1,500통)
- 대량 발송 시 간격을 두고 발송됨
