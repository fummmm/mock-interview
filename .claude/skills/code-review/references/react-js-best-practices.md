# React/JS Best Practices — 코드 리뷰 상세 기준

code-reviewer 에이전트가 React/JS 코드를 리뷰할 때 참조하는 상세 기준.
SKILL.md의 기본 체크리스트를 통과한 후, 더 깊은 리뷰가 필요할 때 이 파일을 읽는다.

## 목차
1. [React 공식 가이드 기반](#1-react-공식-가이드-기반)
2. [접근성 (a11y)](#2-접근성-a11y)
3. [성능 최적화](#3-성능-최적화)
4. [보안 심화](#4-보안-심화)
5. [Zustand 패턴](#5-zustand-패턴)
6. [Supabase 클라이언트](#6-supabase-클라이언트)
7. [미디어 API (이 프로젝트 특화)](#7-미디어-api)

---

## 1. React 공식 가이드 기반

> 출처: react.dev "You Might Not Need an Effect", "Rules of Hooks"

### 불필요한 Effect 제거
많은 Effect는 불필요하다. 다음 패턴이 보이면 지적한다:

| 안티패턴 | 대안 |
|---------|------|
| Effect에서 fetch 후 setState | 데이터 라이브러리 (React Query) 또는 Suspense |
| Effect에서 props/state 변환 후 setState | 렌더 중 직접 계산 (`useMemo` 또는 인라인) |
| Effect에서 이벤트 핸들러와 동일한 작업 | 이벤트 핸들러로 이동 |
| Effect 체인 (A→B→C setState) | 단일 이벤트 핸들러에서 모든 상태 업데이트 |

### Referential Identity 문제
```jsx
// 🔴 매 렌더마다 새 객체 → 무한 루프 위험
useEffect(() => { ... }, [{ key: value }])

// ✅ 원시값으로 분해
useEffect(() => { ... }, [key, value])
```

### 조건부 Hook 호출 금지
```jsx
// 🔴 조건부 Hook
if (condition) { const [state, setState] = useState() }

// ✅ Hook은 항상 최상위에서 호출
const [state, setState] = useState()
```

### StrictMode 호환
- Effect가 두 번 실행되어도 안전한지 확인
- 구독/해제가 쌍을 이루는지 확인

---

## 2. 접근성 (a11y)

> 출처: WCAG 2.1 AA, WAI-ARIA Practices

### 필수 체크리스트

| 항목 | 검증 방법 |
|------|----------|
| **시맨틱 HTML** | `div` + onClick 대신 `button`, `a` 사용 |
| **이미지 alt** | 장식용 이미지는 `alt=""`, 의미있는 이미지는 설명 |
| **폼 라벨** | 모든 input에 `label` 또는 `aria-label` |
| **키보드 내비게이션** | Tab으로 모든 인터랙티브 요소 접근 가능 |
| **포커스 표시** | `outline: none` 금지, `focus-visible` 사용 |
| **색상 대비** | 텍스트/배경 대비 4.5:1 이상 |
| **스크린 리더** | 동적 콘텐츠에 `aria-live` 영역 |
| **미디어 대체** | 영상에 자막, 오디오에 텍스트 대안 |

### 이 프로젝트 특화 — 면접 UI 접근성
- 질문 텍스트: 스크린 리더가 읽을 수 있는 구조
- 타이머: `aria-live="polite"`로 시간 변경 알림
- 웹캠 뷰: `aria-label="면접 화면"`
- 녹화 상태: 시각적 표시 + 텍스트 상태 (`aria-label="녹화 중"`)

---

## 3. 성능 최적화

### 리렌더링 탐지
```jsx
// 🔴 부모가 리렌더될 때마다 자식도 리렌더
<ChildComponent data={{ items }} />

// ✅ 변하지 않는 참조 보존
const data = useMemo(() => ({ items }), [items])
<ChildComponent data={data} />
```

### 번들 사이즈
| 신호 | 조치 |
|------|------|
| 한 페이지에서만 사용하는 큰 라이브러리 | `React.lazy` + `Suspense`로 코드 스플리팅 |
| 전체 라이브러리 import | `import { specific } from 'lib'` 트리 쉐이킹 |
| 이미지를 import로 번들에 포함 | public/ 또는 CDN 사용 |

### React.memo 사용 기준
- 부모가 자주 리렌더되고, 자식 props가 변하지 않을 때만 사용
- 모든 컴포넌트에 memo를 붙이지 않는다 — 비교 비용도 존재

### 리스트 가상화
- 100개 이상 항목 리스트: `@tanstack/react-virtual` 고려
- 무한 스크롤: Intersection Observer 사용

---

## 4. 보안 심화

### target="_blank" 보안
```jsx
// 🔴 Tabnabbing 취약점
<a href={url} target="_blank">Link</a>

// ✅ rel 속성 필수
<a href={url} target="_blank" rel="noopener noreferrer">Link</a>
```

### postMessage 검증
```jsx
// 🔴 origin 미검증
window.addEventListener('message', (e) => handleMessage(e.data))

// ✅ origin 검증 필수
window.addEventListener('message', (e) => {
  if (e.origin !== 'https://trusted.com') return
  handleMessage(e.data)
})
```

### URL 기반 리다이렉트
```jsx
// 🔴 사용자 입력 URL로 직접 리다이렉트 (Open Redirect)
navigate(userInputUrl)

// ✅ 허용 경로 화이트리스트
const ALLOWED = ['/dashboard', '/report', '/setup']
if (ALLOWED.includes(path)) navigate(path)
```

### 환경변수
- `VITE_` 접두사 변수는 클라이언트에 노출됨 — 시크릿을 넣지 않는다
- `SUPABASE_SERVICE_ROLE_KEY`는 절대 VITE_ 접두사로 사용 금지

---

## 5. Zustand 패턴

### 셀렉터 최적화
```jsx
// 🔴 전체 스토어 구독 — 어떤 상태라도 변경되면 리렌더
const store = useInterviewStore()

// ✅ 필요한 필드만 구독
const phase = useInterviewStore((s) => s.phase)
const questions = useInterviewStore((s) => s.questions)
```

### 비동기 액션 에러 핸들링
```jsx
// 🔴 에러 무시
const fetchData = async () => {
  const data = await supabase.from('table').select()
  set({ data: data.data })
}

// ✅ 에러 상태 관리
const fetchData = async () => {
  set({ loading: true, error: null })
  const { data, error } = await supabase.from('table').select()
  if (error) set({ error: error.message, loading: false })
  else set({ data, loading: false })
}
```

### 스토어 간 의존
```jsx
// 🔴 스토어 내에서 다른 스토어를 직접 import하여 subscribe
import { useAuthStore } from './authStore'

// ✅ getState()로 일회성 읽기
const userId = useAuthStore.getState().user?.id
```

---

## 6. Supabase 클라이언트

### Realtime 구독 클린업
```jsx
// 🔴 구독 해제 누락 — 메모리 누수
useEffect(() => {
  supabase.channel('room').on('broadcast', {}, handler).subscribe()
}, [])

// ✅ 클린업에서 unsubscribe
useEffect(() => {
  const channel = supabase.channel('room').on('broadcast', {}, handler).subscribe()
  return () => { supabase.removeChannel(channel) }
}, [])
```

### Auth 세션 리프레시
- `onAuthStateChange` 리스너 등록하여 세션 만료 감지
- 만료 시 로그인 페이지로 리다이렉트

### 에러 처리 패턴
```jsx
// 🔴 에러 무시
const { data } = await supabase.from('interviews').select()

// ✅ 에러 분기 처리
const { data, error } = await supabase.from('interviews').select()
if (error) throw new Error(`Interview fetch failed: ${error.message}`)
```

---

## 7. 미디어 API

> 이 프로젝트 특화 — 웹캠, 오디오, MediaRecorder

### MediaStream 정리
```jsx
// 🔴 스트림 정리 누락 — 카메라 LED 계속 켜짐
useEffect(() => {
  navigator.mediaDevices.getUserMedia({ video: true }).then(setStream)
}, [])

// ✅ 트랙 정지로 리소스 해제
useEffect(() => {
  let stream
  navigator.mediaDevices.getUserMedia({ video: true }).then(s => { stream = s; setStream(s) })
  return () => { stream?.getTracks().forEach(t => t.stop()) }
}, [])
```

### MediaRecorder 상태 검증
```jsx
// 🔴 이미 중지된 레코더에 stop() 호출 → 에러
recorder.stop()

// ✅ 상태 확인
if (recorder.state !== 'inactive') recorder.stop()
```

### 권한 에러 처리
- `NotAllowedError`: 사용자 거부 → 안내 UI 표시
- `NotFoundError`: 장치 없음 → "카메라를 찾을 수 없습니다" 메시지
- `NotReadableError`: 다른 앱이 사용 중 → "카메라가 다른 앱에서 사용 중" 메시지
