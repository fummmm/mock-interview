---
name: code-review
description: "코드 리뷰 가이드. 변경된 코드의 품질, 보안, 성능, 에러 핸들링, 패턴 일관성을 검토한다. code-reviewer 에이전트가 리뷰 수행 시 참조한다. '코드 리뷰', 'code review', 'PR 리뷰', '리뷰해줘', '코드 검토', '코드 점검', '보안 점검', '품질 확인' 키워드에 트리거된다. 단, 기능 테스트(QA)나 리팩토링 실행은 이 스킬의 범위가 아니다."
---

# Code Review — 코드 리뷰 가이드

code-reviewer 에이전트가 코드 리뷰를 수행할 때 참조하는 리뷰 기준과 워크플로우.

## 대상 에이전트

`code-reviewer` — 이 스킬의 기준으로 코드 리뷰를 수행한다.

## 리뷰 워크플로우

### 1단계: 변경 범위 파악
```bash
git diff --name-only HEAD~1  # 마지막 커밋 대비
git diff --name-only         # 미커밋 변경사항
```

변경된 파일만 리뷰한다. 변경하지 않은 파일은 리뷰 대상이 아니다.

### 2단계: 파일별 리뷰

각 변경 파일을 읽고, 아래 도메인별 체크리스트를 적용한다.

### 3단계: 결과 작성

심각도(🔴🟡🔵)별로 분류하여 리뷰 결과를 작성한다.

## 도메인별 리뷰 기준

### React 컴포넌트 (.jsx)

| 항목 | 나쁜 패턴 | 좋은 패턴 |
|------|----------|----------|
| Effect 클린업 | `useEffect(() => { sub() })` | `useEffect(() => { sub(); return () => unsub() })` |
| 의존성 배열 | 빈 배열에 외부 변수 참조 | 사용하는 값을 모두 포함 |
| 이벤트 리스너 | addEventListener만 호출 | cleanup에서 removeEventListener |
| 조건부 렌더링 | `count && <List />` (count=0이면 "0" 렌더) | `count > 0 && <List />` |
| key | 배열 인덱스를 key로 사용 | 고유 ID를 key로 사용 |

### Zustand 스토어

| 항목 | 확인 |
|------|------|
| 셀렉터 사용 | `useStore(state => state.field)` — 필요한 것만 구독 |
| 비동기 액션 | try-catch 에러 핸들링 |
| 스토어 크기 | 200줄 초과 시 분리 고려 |

### API/서버리스 함수

| 항목 | 확인 |
|------|------|
| 입력 검증 | 요청 파라미터 타입/범위 검증 |
| 에러 응답 | 내부 스택 트레이스 미노출 |
| 타임아웃 | 외부 API 호출에 타임아웃 설정 |
| 환경변수 | 하드코딩 없음, process.env 사용 |

### Supabase

| 항목 | 확인 |
|------|------|
| RLS | 새 테이블에 RLS 활성화 + 정책 |
| select | `select('*')` 대신 필요 컬럼만 |
| 에러 처리 | `const { data, error } = await supabase...` 후 error 체크 |

### 보안 (모든 파일)

| 취약점 | 탐지 패턴 |
|--------|----------|
| XSS | `dangerouslySetInnerHTML`, 사용자 입력 직접 렌더링 |
| 시크릿 노출 | `SUPABASE_SERVICE_ROLE_KEY`가 클라이언트 코드에 존재 |
| 인젝션 | 문자열 연결로 쿼리 구성 |
| 오픈 리다이렉트 | 사용자 입력 URL로 `navigate()` |

## 심화 리뷰 기준

기본 체크리스트를 넘어 더 깊은 리뷰가 필요할 때 `references/react-js-best-practices.md`를 읽는다.
다음 영역을 다룬다:
- React 공식 가이드 (불필요한 Effect, Referential Identity, StrictMode)
- 접근성 a11y (시맨틱 HTML, aria, 키보드, 색상 대비, 미디어 대체)
- 성능 심화 (번들 사이즈, React.memo 기준, 리스트 가상화)
- 보안 심화 (target="_blank", postMessage, 오픈 리다이렉트, VITE_ 환경변수)
- Zustand 패턴 (셀렉터 최적화, 비동기 에러, 스토어 간 의존)
- Supabase 클라이언트 (Realtime 클린업, Auth 세션, 에러 처리)
- 미디어 API (MediaStream 정리, MediaRecorder 상태, 권한 에러)

## 리뷰 톤 가이드

- **문제 지적 시**: "~하면 ~위험이 있습니다. ~로 수정하면 안전합니다." (이유 + 대안)
- **칭찬 시**: "~패턴이 잘 적용되었습니다." (구체적으로)
- **금지**: "이 코드는 나쁘다", "왜 이렇게 했나" — 비난이 아닌 개선 제안
