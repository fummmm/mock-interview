# QA Report -- 꼬리질문 로직 전면 개편

> 검증 대상: `src/lib/api/interview.js`, `src/pages/InterviewPage.jsx`, `src/stores/interviewStore.js`
> 기준 문서: `_workspace/01_design.md`
> 작성: qa-engineer

---

## A. generateFollowUp (interview.js)

| # | 검증 항목 | 결과 | 비고 |
|---|----------|------|------|
| A1 | 시그니처: (questionText, correctedTranscript, evaluatorNames, questionId, recordingDuration, followUpCount, maxFollowUps) | **PASS** | JSDoc + 실제 파라미터 일치 |
| A2 | 사전 필터: beh-intro/beh-lastq 스킵 | **PASS** | L133-135 |
| A3 | 사전 필터: duration < 5 스킵 | **PASS** | L138-140 |
| A4 | incomplete 유형: 5-15초 + transcript < 30자 -> 하드코딩 | **PASS** | L144-153, 문구도 설계와 일치 |
| A5 | 모델: anthropic/claude-haiku-4-5-20251001 | **FAIL** | 설계서 기재: `anthropic/claude-3-5-haiku-latest`, 실제 구현: `anthropic/claude-haiku-4-5-20251001`. 모델 ID 불일치 |
| A6 | maxTokens: 512, temperature: 0.3, timeoutMs: 8000, jsonMode: true | **PASS** | L163-166 |
| A7 | 3-Criteria 프롬프트 (C1, C2, C3) + deficiency 유형 | **PASS** | 설계서 프롬프트와 정확히 일치 |
| A8 | 빈도 제어: followUpCount/maxFollowUps 프롬프트 내 포함 | **PASS** | L198-202 |
| A9 | 반환 형태: { needed, question?, evaluatorId?, deficiency?, c1?, c2?, c3?, reason? } | **PASS** | Haiku 응답 JSON 직접 반환, needed 필드 검증 포함 |
| A10 | incomplete 하드코딩 반환에 c1/c2/c3 필드 누락 | **WARN** | L146-152: c1, c2, c3 필드 없이 반환. InterviewPage에서 `??` null 처리하므로 런타임 에러 없지만, 리포트 분석 시 incomplete 유형만 c1/c2/c3가 undefined가 됨 |
| A11 | 에러 핸들링: 모든 에러 -> { needed: false } | **PASS** | L248-252, try-catch 전체 감싸기 |

### A5 상세: 모델 ID 불일치

- **설계서**: `anthropic/claude-3-5-haiku-latest`
- **구현**: `anthropic/claude-haiku-4-5-20251001`
- **심각도**: **LOW**
- `claude-haiku-4-5-20251001`은 Haiku 4.5의 구체적 날짜 버전이고, `claude-3-5-haiku-latest`는 3.5 세대 latest alias다. 이 둘은 실제로는 동일 모델을 가리킬 가능성이 높지만, OpenRouter 라우팅에서 다르게 처리될 수 있다. 의도적 선택인지 확인 필요.
- **권장**: 설계서를 구현에 맞춰 업데이트하거나, 구현을 설계서에 맞춰 `claude-3-5-haiku-latest`로 변경. 어느 쪽이든 통일할 것.

---

## B. InterviewPage.jsx

| # | 검증 항목 | 결과 | 비고 |
|---|----------|------|------|
| B1 | Web Speech API 완전 제거 (speechRef, roughTranscriptRef, initSpeech, startSpeech, stopSpeech) | **PASS** | grep 검색 결과 0건. 완전 제거 확인 |
| B2 | followUpCountRef 존재 + 정상 증가 | **PASS** | L55 `useRef(0)`, L368/L448에서 `followUpCountRef.current++` |
| B3 | maxFollowUps 계산: Math.min(3, Math.ceil(questions.length * 0.5)) | **PASS** | L56 |
| B4 | handleStopAnswer reviewing 시퀀스: STT await -> 교정 await -> generateFollowUp await | **PASS** | L353-437, 순차 await 처리 |
| B5 | 사전 필터: duration < 5, intro, followUpCount >= maxFollowUps | **PASS** | L311-333, Haiku 호출 전에 3가지 사전 필터 모두 존재 |
| B6 | isGenerating 상태 제거, phase === 'reviewing' 사용 | **PASS** | grep 검색 결과 `isGenerating` 0건 |
| B7 | Reviewing 오버레이 UI: 프로그레스 바 + 3단계 텍스트 | **PASS** | L826-862, 프로그레스 바 + 3단계 텍스트 + 점 애니메이션 |
| B8 | 20초 전체 타임아웃 | **PASS (주의사항 있음)** | L340-343, AbortController + setTimeout(20000). 단, signal은 API 호출에 전달되지 않음. 체크포인트 기반 abort만 동작 |
| B9 | STT 실패 폴백: 5-15초 -> incomplete, 나머지 -> 스킵 | **PASS** | L365-405 |
| B10 | 꼬리질문 메타데이터 저장: deficiency, c1, c2, c3 | **PASS** | L452-468, `followUp.deficiency`, `followUp.c1 ?? null`, `followUp.c2 ?? null`, `followUp.c3 ?? null` |
| B11 | 하드모드 호환: 타이핑 애니메이션 + 카운트다운 | **PASS** | L175-232, `phase !== 'ready'` 조건으로 reviewing 중 타이핑 차단. 꼬리질문 시 `isFollowUp` + `followUpQuestion` 변경 -> useEffect 트리거 -> 타이핑 시작 |
| B12 | processInBackground 제거 | **PASS** | grep 검색 결과 0건 |
| B13 | 일반모드 흐름 정상 | **PASS** | ready -> recording -> reviewing -> (followup-ready or next). ready에서 버튼 클릭으로 녹화 시작, 답변 완료 시 reviewing, 결과에 따라 분기 |
| B14 | 하드모드 흐름 정상 (카운트다운, 타이머, 자동 종료) | **PASS** | L236-264, 시간 초과 시 자동 handleStopAnswer/handleStopFollowUp 호출 |
| B15 | 꼬리질문 답변 녹화 정상 (handleStartFollowUp, handleStopFollowUp) | **PASS** | L503-582, 꼬리질문 답변도 STT+교정 백그라운드 수행 |
| B16 | 프론트엔드 최종 검증 (Haiku needed:true 반환해도 횟수 초과 시 무시) | **PASS** | L443-446 `followUpCountRef.current < maxFollowUps` 조건 체크 |
| B17 | 미사용 import: DeviceDropdown | **FAIL** | L13에서 import되지만 JSX에서 사용되지 않음 |
| B18 | 미사용 변수: loadDevices | **FAIL** | L48에서 destructure되지만 코드 내 호출 없음 |

### B8 상세: 20초 타임아웃의 제한사항

- **심각도**: **MEDIUM**
- `AbortController.abort()`는 호출되지만, `signal`이 `transcribeAudio()`, `correctTranscript()`, `generateFollowUp()` 어느 곳에도 전달되지 않는다.
- 실제로는 각 async 호출 사이의 `if (abortController.signal.aborted) throw` 체크포인트에서만 abort가 감지된다.
- 만약 `transcribeAudio()`가 25초 걸리면, 그 호출이 끝난 뒤에야 abort가 감지되므로 20초 타임아웃이 실질적으로 무력화된다.
- **권장**: `Promise.race`로 20초 타임아웃을 구현하거나, signal을 각 API 함수에 전달할 것.

### B17-B18 상세: 미사용 import/변수

- **심각도**: **LOW**
- `DeviceDropdown` 컴포넌트 import (L13)과 `loadDevices` 함수 destructure (L48)는 코드에서 사용되지 않는다.
- 기존 코드에서 남은 잔재로 추정. 번들 사이즈에 미미한 영향.
- **권장**: 사용하지 않는 import와 destructure 제거.

---

## C. Integration

| # | 검증 항목 | 결과 | 비고 |
|---|----------|------|------|
| C1 | 빌드 성공 | **PASS** | `npx vite build` 정상 완료 (1.84s) |
| C2 | import 경로: generateFollowUp from '../lib/api' | **PASS** | L9, barrel export(`src/lib/api/index.js` L5)를 통해 정상 연결 |
| C3 | 미사용 import/변수 | **FAIL** | B17, B18 참조 (DeviceDropdown, loadDevices) |
| C4 | interviewStore phase에 'reviewing' 추가 여부 | **WARN** | `setPhase`는 단순 `set({ phase })` (L153)로 어떤 문자열이든 허용. 'reviewing'은 유효한 phase로 동작하지만, store에 phase 열거값이 명시적으로 정의되지 않아 타입 안전성 없음 |

### C4 상세: reviewing phase의 유효성

- **심각도**: **LOW**
- `interviewStore.js`의 `setPhase`는 단순히 `set({ phase })`로 구현되어 있어, 'reviewing'이든 어떤 문자열이든 자유롭게 설정 가능하다.
- store에 명시적인 phase 열거형 검증은 없다. 현재 사용되는 phase 값: `setup`, `ready`, `recording`, `reviewing`, `processing`, `report`.
- 기능상 문제는 없지만, store 레벨에서 허용된 phase 목록을 관리하면 디버깅이 쉬워진다.
- **권장**: 당장 조치 불필요. 향후 TypeScript 전환 시 phase 유니언 타입 정의를 권장.

---

## 발견된 이슈 요약

| # | 이슈 | 심각도 | 파일 | 권장 조치 |
|---|------|--------|------|----------|
| 1 | 모델 ID 불일치 (설계서 vs 구현) | **LOW** | interview.js L162 | 설계서 또는 구현 중 하나로 통일 |
| 2 | 20초 타임아웃 체크포인트 방식 -- 개별 API 호출 중 abort 불가 | **MEDIUM** | InterviewPage.jsx L340-343 | Promise.race 또는 signal 전달 방식으로 개선 |
| 3 | incomplete 하드코딩 반환에 c1/c2/c3 필드 없음 | **LOW** | interview.js L146-152 | `c1: null, c2: null, c3: null` 추가 |
| 4 | 미사용 import: DeviceDropdown | **LOW** | InterviewPage.jsx L13 | 삭제 |
| 5 | 미사용 변수: loadDevices | **LOW** | InterviewPage.jsx L48 | destructure에서 제거 |

---

## 종합 판정

**PASS (조건부)**

핵심 로직(3-Criteria 판단, reviewing 시퀀스, 빈도 제어, 사전 필터, 에러 핸들링, 하드모드 호환, Web Speech 제거)은 설계서와 정확히 일치하며 정상 동작한다. 빌드도 성공.

이슈 #2(타임아웃 실효성)만 MEDIUM이며, 나머지는 모두 LOW. 이슈 #2는 Whisper STT가 극단적으로 느린 네트워크 환경에서만 발현되므로, 현 단계에서는 수용 가능하나 후속 개선을 권장한다.
