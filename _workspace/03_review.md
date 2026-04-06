# 코드 리뷰 결과

**대상 파일**: useMediaRecorder.js, interview.js, InterviewPage.jsx
**리뷰어**: code-reviewer
**일시**: 2026-04-06

---

## 1. `src/hooks/useMediaRecorder.js`

### 잘된 점
- `recorder.state` 검증 후 `requestData()` 호출하여 inactive 상태에서의 에러를 방어한 패턴이 잘 적용되었습니다.
- `onstop` 콜백에서 Blob 생성하여 모든 청크가 수신된 후 resolve하는 구조가 안전합니다.
- try-catch로 `requestData()` 미지원 브라우저를 방어한 것이 좋습니다.

### 특별 검증: 100ms setTimeout

```
setTimeout(() => {
  recorder.stop()
}, 100)
```

**판정: 문제 없음 (조건부)**

- `stopRecording()`은 Promise를 반환하고, resolve는 `onstop` 콜백에서 실행됩니다. 100ms 지연은 Promise resolve 시점에 영향을 주지 않습니다. 호출부에서 `await stopRecording()` 하면 `onstop`이 실행될 때까지 기다리므로, 100ms 지연이 문제가 되지 않습니다.
- 다만, `requestData()` → `ondataavailable` 처리에 100ms면 충분한지는 브라우저 구현에 따라 다릅니다. 대부분의 환경에서 충분하지만, 보장은 아닙니다.

### 이슈

| 심각도 | 항목 | 설명 |
|:---:|------|------|
| **🟡** | **onstop 핸들러 덮어쓰기** | L62에서 `recorder.onstop = () => {...}`로 할당하는데, 만약 `startRecording`에서 onstop을 이미 등록했거나 외부에서 등록한 경우 덮어씌워집니다. 현재 코드에서는 startRecording에서 onstop을 등록하지 않으므로 실질적 문제는 없으나, `addEventListener('stop', ...)`를 사용하면 더 안전합니다. |
| **🟡** | **stopRecording resolve 누락 경로** | `recorder.stop()` 호출 시 브라우저가 `onstop`을 호출하지 않는 극단적 케이스에서 Promise가 영원히 pending 상태가 됩니다. 타임아웃 안전장치(예: 5초 후 강제 resolve)가 있으면 더 견고합니다. |
| **💡** | **startTimeRef null 체크** | L71에서 `Date.now() - startTimeRef.current`를 계산하는데, startTimeRef.current가 null이면 NaN이 됩니다. startRecording 없이 stopRecording을 호출하는 경로는 L44에서 방어되지만, 방어적으로 `startTimeRef.current \|\| Date.now()` 처리를 고려할 수 있습니다. |

---

## 2. `src/lib/api/interview.js`

### 잘된 점
- Haiku 프롬프트에 "STT 입력 안내" 섹션을 추가하여 raw transcript의 오인식 가능성을 명시한 것이 좋습니다. Haiku가 STT 오류에 과민 반응하여 불필요한 꼬리질문을 생성하는 문제를 예방합니다.
- 사전 필터(자기소개/마무리 스킵, 5초 미만 스킵, incomplete 하드코딩)가 Haiku 호출 비용을 절감합니다.
- `safeParseJSON` + `needed` 필드 타입 체크로 환각 방어가 잘 되어 있습니다.
- generateFollowUp 전체를 try-catch로 감싸 모든 에러 경로에서 `{ needed: false }`를 반환하는 것이 안전합니다.

### 이슈

| 심각도 | 항목 | 설명 |
|:---:|------|------|
| **🟡** | **correctTranscript 환각 방어 순서** | L91-102: 환각 방어 1(길이 비교)은 교정 결과(`corrected`)를 사용하고, 환각 방어 2(Whisper 환각 감지)는 `rawTranscript`를 사용합니다. 문제는 환각 방어 2가 `rawTranscript.trim().length < 15`이면 빈 문자열을 반환하는데, L11에서 이미 `rawTranscript.trim().length < 5`이면 조기 리턴합니다. 5~14자 구간에서는 Sonnet 호출 후 빈 문자열로 바뀌는 것인데, Sonnet 호출 비용이 낭비됩니다. **환각 방어 2를 Sonnet 호출 전(L11 근처)으로 이동하면 비용 절감됩니다.** |
| **💡** | **프롬프트 user 메시지 파라미터명 불일치** | L242: `correctedTranscript` 파라미터를 받지만, user 메시지에서는 `[답변 (음성 인식 원본, 오인식 포함 가능)]`이라고 레이블합니다. 분기 C에서 raw transcript를 넣으므로 정확하지만, 분기 D의 `startBackgroundSTT`에서는 교정 완료 후의 텍스트가 아닌 raw를 넣을 수도 있습니다. 파라미터명을 `transcript`로 변경하거나, JSDoc 설명을 "STT 원본 또는 교정 완료된 답변 텍스트"에서 실제 사용 패턴에 맞게 정리하면 혼동이 줄어듭니다. |
| **💡** | **Haiku jsonMode 의존** | L166: `jsonMode: true`를 사용하는데, 이는 OpenRouter의 `response_format: { type: "json_object" }`에 매핑될 것입니다. Haiku가 JSON을 잘 지키지만, `safeParseJSON`으로 이중 방어하고 있으므로 현재 구조는 충분합니다. |

---

## 3. `src/pages/InterviewPage.jsx`

### 잘된 점
- 4분기(A/B/C/D) 파이프라인이 명확한 주석과 함께 녹화 시간 기반으로 분기되어 가독성이 높습니다.
- 각 분기의 역할이 뚜렷합니다: A(사전 필터), B(즉시 꼬리질문), C(STT+Haiku 판단), D(충분한 답변, 백그라운드 처리).
- `isMountedRef`와 `sessionId` 비교로 언마운트/세션 변경 후 상태 업데이트를 방지하는 패턴이 잘 적용되었습니다.
- 꼬리질문 빈도 제어(`followUpCountRef`, `maxFollowUps`)가 면접 경험 품질을 보호합니다.

### 특별 검증 항목

#### (1) Promise.race 메모리 누수 (분기 C)

```js
sttResult = await Promise.race([
  transcribeAudio(result.blob),
  new Promise((_, reject) => setTimeout(() => reject(new Error('STT 타임아웃')), 12000)),
])
```

**판정: 실질적 문제 낮음, 개선 가능**

- `Promise.race`가 타임아웃으로 reject해도 `transcribeAudio`는 계속 실행됩니다. Whisper.js는 WebAssembly/Worker 기반이므로, 실행이 완료되면 자연스럽게 GC됩니다.
- `transcribeAudio`가 resolve/reject된 Promise 결과는 아무도 참조하지 않으므로 GC 대상이 됩니다.
- **실질적 리스크**: 메모리 누수보다는 CPU 낭비입니다. 타임아웃되었는데도 Whisper가 계속 돌고 있으면, 다음 질문의 녹음/재생에 CPU 경합이 발생할 수 있습니다. 다만 15~45초 분량 오디오의 Whisper base 처리는 대부분 12초 안에 끝나므로, 타임아웃 발생 빈도 자체가 낮습니다.
- **개선안**: `AbortController`를 `transcribeAudio`에 전달하여 타임아웃 시 Worker를 중단할 수 있지만, 현재 whisper.js 구조(순차 큐 기반)에서 Worker 중단은 복잡도가 높아 ROI가 낮습니다.

#### (2) startBackgroundSTT의 useCallback 의존성

```js
const startBackgroundSTT = useCallback((idx, blob, questionText) => {
  ...
  const corrected = await correctTranscript(sttResult.transcript, questionText, track)
  ...
}, [incPendingSTT, decPendingSTT, updateAnswer, track])
```

**판정: 문제 없음**

- `correctTranscript`는 `src/lib/api/interview.js`에서 `import`된 모듈 수준 함수입니다. React 렌더 사이클과 무관한 정적 참조이므로, 의존성 배열에 포함할 필요가 없습니다.
- `transcribeAudio`도 마찬가지로 `src/lib/whisper.js`에서 import된 정적 함수입니다.
- `useInterviewStore.getState()`도 Zustand의 정적 메서드이므로 의존성에 불필요합니다.

#### (3) 분기 C 백그라운드 교정의 pendingSTT 누락

```js
// 백그라운드: Sonnet 교정 (리포트용, 논블로킹)
if (rawText) {
  const mySession = useInterviewStore.getState().sessionId
  ;(async () => {
    try {
      const corrected = await correctTranscript(rawText, questionText, track)
      ...
    } catch (e) { ... }
  })()
}
```

**판정: 🔴 문제 있음**

- 분기 C에서 STT 완료 후 Sonnet 교정을 백그라운드로 실행하는데, `incPendingSTT()`/`decPendingSTT()`를 호출하지 않습니다.
- `AnalyzingPage`는 `pendingSTT === 0`이 될 때까지 대기한 후 분석을 시작합니다(L107-119).
- **시나리오**: 마지막 질문이 분기 C(15~45초)에 해당하면, STT는 동기적으로 완료되어 pendingSTT에 카운트되지 않고, Sonnet 교정이 백그라운드에서 실행 중인 상태로 `nextQuestion()` → `processing` → `AnalyzingPage`로 이동합니다. 이때 pendingSTT는 이미 0이므로, AnalyzingPage가 즉시 분석을 시작합니다. Sonnet 교정이 아직 끝나지 않았으면 **교정 전 raw transcript로 분석이 실행**됩니다.
- **영향**: 분석 품질이 저하될 수 있습니다 (raw transcript에는 STT 오인식이 포함).
- **수정안**: 분기 C의 백그라운드 교정에도 `incPendingSTT()`/`decPendingSTT()` 쌍을 추가하거나, 분기 C에서는 교정을 await로 처리합니다.

### 기타 이슈

| 심각도 | 항목 | 설명 |
|:---:|------|------|
| **🔴** | **분기 C pendingSTT 누락** | 위 특별 검증 항목 (3) 참조. 마지막 질문이 분기 C일 때 교정 전 텍스트로 분석이 실행될 수 있습니다. |
| **🟡** | **handleStopAnswer 의존성 배열에 evaluators** | L518: `evaluators`는 `getEvaluators(track, companySize)` 결과인데, 매 렌더마다 새 배열을 생성합니다. `handleStopAnswer`가 매 렌더마다 재생성되어, 이를 참조하는 하위 컴포넌트가 있으면 불필요한 리렌더가 발생합니다. `evaluators`를 `useMemo`로 안정화하면 좋습니다. |
| **🟡** | **handleStopAnswer 내 frames 참조** | L327: `frames: finalFrames \|\| frames`에서 `frames`는 useFrameCapture의 state입니다. `stopCapture()`가 최신 프레임을 반환하므로 `finalFrames`가 항상 있어야 하지만, fallback으로 `frames`를 사용합니다. 이 `frames`는 useCallback 클로저에 캡처된 값이므로, 타이밍에 따라 stale할 수 있습니다. 의존성 배열에 `frames`가 포함되어 있어 매 캡처마다 함수가 재생성되는 비용도 있습니다. `finalFrames`가 null인 케이스가 실제로 발생하는지 확인 후, fallback이 불필요하면 제거하여 의존성에서 `frames`를 뺄 수 있습니다. |
| **🟡** | **useEffect 의존성 eslint-disable 2건** | L159, L258에서 `eslint-disable-line react-hooks/exhaustive-deps`를 사용합니다. L159(권한 요청)는 mount 시 1회 실행 의도이므로 의도적이지만, L258(`timeLeft` 변경 시 handleStop 호출)은 `handleStopAnswer`, `handleStopFollowUp`, `isFollowUp` 등을 의존성에서 누락합니다. 이 함수들이 stale closure를 참조할 위험이 있습니다. |
| **🟡** | **분기 B에서 evaluators[0] 하드코딩** | L360-361: `evaluators[0]`를 꼬리질문 출제자로 하드코딩합니다. 이것은 `generateFollowUp`의 incomplete 분기(L141-142)와 일치하므로 의도적이지만, evaluators 배열이 비어있으면 undefined 에러가 발생합니다. `evaluators[0]`에 대한 null 체크가 있으면 안전합니다. |
| **💡** | **handleStopFollowUp에서 직접 setState** | L540-551: `useInterviewStore.setState({ answers })`로 직접 상태를 조작합니다. 스토어의 `updateAnswer` 액션과 패턴이 다릅니다. followUp 필드의 업데이트를 위해 `updateAnswer`를 확장하거나, 별도 `updateFollowUpAnswer` 액션을 만들면 패턴 일관성이 향상됩니다. |
| **💡** | **컴포넌트 크기** | InterviewPage.jsx가 975줄입니다. 4분기 파이프라인 로직(handleStopAnswer)만 190줄이며, JSX 렌더링도 310줄입니다. 커스텀 훅(`useInterviewFlow` 등)으로 비즈니스 로직을 추출하면 가독성/테스트성이 향상됩니다. 다만, 현재 리팩토링 단계가 아니라면 후순위로 괜찮습니다. |

---

## 보안 점검

| 항목 | 결과 |
|------|------|
| **XSS** | `dangerouslySetInnerHTML` 미사용. 사용자 입력(transcript)은 JSX로 렌더링되므로 자동 이스케이프됨. 문제 없음. |
| **시크릿 노출** | API 키가 클라이언트 코드에 하드코딩되지 않음. `callOpenRouter`가 내부적으로 환경변수를 사용하는 것으로 보임. 문제 없음. |
| **민감 데이터** | transcript, videoBlob 등 사용자 면접 데이터가 클라이언트 메모리에만 존재. Zustand 스토어는 DevTools에 노출될 수 있으나, 개발 환경에서만 해당. |

---

## 전체 판정

### 요약

| 심각도 | 건수 |
|:---:|:---:|
| **🔴 필수 수정** | **1건** |
| **🟡 권장 수정** | **6건** |
| **💡 제안** | **4건** |

### 필수 수정 사항

**분기 C의 pendingSTT 누락**이 유일한 필수 수정 사항입니다. 마지막 질문이 15~45초 답변일 때, Sonnet 교정이 완료되기 전에 AnalyzingPage가 분석을 시작하여 raw transcript 기반으로 분석될 수 있습니다.

수정안 (InterviewPage.jsx, 분기 C 백그라운드 교정 부분):

```js
// 백그라운드: Sonnet 교정 (리포트용, 논블로킹)
if (rawText) {
  incPendingSTT()  // ← 추가
  const mySession = useInterviewStore.getState().sessionId
  ;(async () => {
    try {
      const corrected = await correctTranscript(rawText, questionText, track)
      if (useInterviewStore.getState().sessionId !== mySession) return
      updateAnswer(idx, { transcript: corrected })
    } catch (e) {
      console.warn(`[백그라운드] Q${idx + 1} 교정 실패:`, e.message)
    } finally {
      if (useInterviewStore.getState().sessionId === mySession) decPendingSTT()  // ← 추가
    }
  })()
}
```

### 전체 코드 품질 평가

3개 파일 모두 핵심 로직의 설계 의도가 명확하고, 에러 핸들링이 대부분의 경로에서 잘 처리되어 있습니다. 특히 4분기 파이프라인은 녹화 시간에 따른 UX 최적화가 잘 설계되었습니다. 필수 수정 1건 반영 후 머지 가능합니다.

---

Q1: 분기 C의 pendingSTT 누락 수정 시, `incPendingSTT`를 `handleStopAnswer`의 useCallback 의존성 배열에 이미 포함되어 있는지 확인했는가? 현재 `startBackgroundSTT`를 통해 간접 참조하는 것과 직접 호출하는 것의 차이가 있는지?

Q2: InterviewPage가 975줄인데, 이번 리팩토링 이후 추가 기능(예: 새 면접 유형, 분기 조건 변경)이 예정되어 있다면, 비즈니스 로직을 커스텀 훅으로 분리하는 작업을 다음 스프린트에 넣는 게 좋지 않을까?

Q3: Whisper STT 12초 타임아웃이 실제 사용자 환경에서 얼마나 자주 발생하는지 데이터가 있는가? 타임아웃 빈도가 높다면 타임아웃 값을 늘리거나, 타임아웃 시에도 부분 결과를 활용하는 전략이 필요할 수 있다.
