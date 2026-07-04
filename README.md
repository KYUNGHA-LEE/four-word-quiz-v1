# four-word-quiz-V1 — 4글자 퀴즈 (실시간 교실 게임)

강사가 낸 문제(정답 여러 개 허용)를 학생들이 실시간으로 맞히는 교실용 웹앱입니다.

- 정답 +1점 / 오답 -1점, 문제당 1번만 제출
- 타이머 없음 — 강사가 "다음 문제" 버튼으로 진행
- 최종 순위 상위 3등 표시 (개인전, 중간 입장 허용)
- 정답은 서버에서만 채점 → 학생 화면에 정답이 노출되지 않아 커닝·점수 조작 불가

---

## 파일 구조

```
/
├── index.html            게임 전체 화면 (첫 화면 / 강사 / 학생)
├── README.md             이 문서
├── package.json          서버 함수용 (firebase-admin)
├── .env.example          환경변수 예시 (실제 .env 는 올리지 말 것)
├── .gitignore            .env, node_modules 제외
├── vercel.json           Vercel 설정
├── database.rules.json   Firebase 보안 규칙 (콘솔에 붙여넣기)
└── api/
    ├── check-teacher.js  강사 비밀번호 확인 + 방 생성 + hostUid 등록
    └── submit-answer.js  학생 답안 채점 (정답 목록은 서버만 접근)
```

---

## 1. Firebase 설정

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트 생성 (`four-word-quiz-V1`)
2. 웹 앱 추가(`</>`) → 나오는 `firebaseConfig` 복사
   → `index.html` 상단의 `const firebaseConfig = { ... }` 부분에 붙여넣기
   (이 값은 공개돼도 됩니다)
3. Authentication → 익명(Anonymous) 로그인 사용 설정
4. Realtime Database 생성 (위치: asia-southeast1 싱가포르, 잠금 모드)
   → 상단의 DB URL 복사 (`FIREBASE_DATABASE_URL` 로 사용)
5. Realtime Database → 규칙(Rules) 탭에 `database.rules.json` 내용 붙여넣고 게시
6. 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성 → 받은 `.json` 파일에서
   `project_id`, `client_email`, `private_key` 값을 Vercel 환경변수로 사용
   (이 파일과 private_key 는 절대 공개 금지)

---

## 2. 문제 등록 (Firebase 콘솔에서 직접)

이 게임은 앞 2글자(`prefix`)를 보여주고, 학생이 뒤 2글자를 입력해 네 글자 낱말을 완성하는 방식입니다.

- `prefix` : 학생에게 보여줄 앞 2글자 (예: `김치`, `버스`)
- `answers` : 정답이 되는 뒤 2글자 목록. 여러 개 넣으면 그중 아무거나 맞으면 정답 처리됩니다.
  - 예: `김치` → `찌개`, `찌게`, `볶음` … 중 하나 입력 시 정답
  - 예: `버스` → `기사`, `노선`, `요금`, `카드` 중 하나 입력 시 정답
- 공백은 무시하고 비교합니다. (예: `찌 개` = `찌개`)

가장 쉬운 방법: 데이터 탭에서 최상위 옆 [더보기] → JSON 가져오기(Import JSON) 로 아래 파일을 통째로 넣기.

```json
{
  "questionBank": {
    "fourWordQuiz": {
      "count": 3,
      "questions": {
        "0": {
          "prefix": "김치",
          "answers": ["찌개", "찌게", "볶음", "만두", "김밥"]
        },
        "1": {
          "prefix": "버스",
          "answers": ["기사", "노선", "요금", "카드"]
        },
        "2": {
          "prefix": "생일",
          "answers": ["축하", "선물", "파티", "카드"]
        }
      }
    }
  }
}
```

주의: `count` 값은 실제 문제 개수와 맞춰 주세요. (문제 5개면 `"count": 5`)
문제는 `"0"`, `"1"`, `"2"` … 0부터 순서대로 번호를 매깁니다.

---

## 3. GitHub 업로드

- ZIP 말고 압축을 푼 파일/폴더를 그대로 올립니다.
- 올릴 파일: `index.html`, `README.md`, `package.json`, `.env.example`, `.gitignore`, `vercel.json`, `database.rules.json`, `api/` 폴더
- 올리면 안 되는 것: `.env`, `node_modules`, 서비스 계정 `.json` 키 파일

---

## 4. Vercel 배포 & 환경변수

1. [Vercel](https://vercel.com)에서 GitHub 저장소 연결 → 배포
2. Settings → Environment Variables 에 아래 값 등록:

| 이름 | 값 |
|---|---|
| `TEACHER_PASSWORD` | 강사 비밀번호 (쉬운 값 금지) |
| `FIREBASE_PROJECT_ID` | 서비스 계정의 `project_id` |
| `FIREBASE_CLIENT_EMAIL` | 서비스 계정의 `client_email` |
| `FIREBASE_PRIVATE_KEY` | 서비스 계정의 `private_key` (아래 주의) |
| `FIREBASE_DATABASE_URL` | Realtime Database URL |

`FIREBASE_PRIVATE_KEY` 주의: `.json` 파일의 `private_key` 값을 통째로 복사해 붙여넣으세요.
`-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n` 형태 그대로 넣으면 됩니다.
코드에서 `\n` 을 자동으로 줄바꿈으로 변환합니다.

3. 환경변수를 추가/수정한 뒤에는 반드시 Redeploy(재배포) 하세요.

---

## 5. 게임 사용 방법

강사

1. 배포된 주소 접속 → 강사로 입장 → 비밀번호 입력(Enter) → 방 만들기
2. 화면의 방 코드 / QR / 링크를 학생에게 공유
3. 게임 시작 → 다음 문제 로 진행 → 마지막 문제 후 자동 종료(순위 발표)
4. 필요 시 일시정지 / 재개 / 강제 종료 / 점수 수정 / 초기화 사용
   - 초기화: 학생 전원 퇴장 + 모든 기록 삭제 후 대기 상태로

학생

1. QR/링크로 접속(방 코드 자동 입력) 또는 학생으로 입장 → 방 코드·닉네임 입력(Enter)
2. 문제가 나오면 정답 입력 후 Enter 로 제출 (문제당 1번)

---

## 오류 해결

| 증상 | 확인할 것 |
|---|---|
| 방 만들기 시 "비밀번호가 틀렸습니다" | Vercel `TEACHER_PASSWORD` 값 / Redeploy 여부 |
| "등록된 문제가 없습니다" | Firebase `questionBank/fourWordQuiz` 데이터, `count` 값 |
| 제출은 되는데 점수 안 변함 | 서비스 계정 환경변수 4개, `FIREBASE_DATABASE_URL` 정확한지 |
| 화면은 뜨는데 로그인 오류 | `index.html` 의 `firebaseConfig`, Authentication 익명 로그인 켰는지 |
| 소리가 안 남 | 화면을 한 번 클릭/터치 (브라우저 자동재생 정책) |
| 권한 오류(permission denied) | `database.rules.json` 을 규칙 탭에 붙여넣고 게시했는지 |

---

## 수업 전 체크리스트

- [ ] `index.html` 에 `firebaseConfig` 붙여넣었다
- [ ] Authentication 익명 로그인 켰다
- [ ] Realtime Database 만들고 규칙 게시했다
- [ ] 문제 데이터(`questionBank`)와 `count` 넣었다
- [ ] Vercel 환경변수 5개 등록하고 Redeploy 했다
- [ ] 강사/학생으로 각각 접속해 1문제 테스트했다
