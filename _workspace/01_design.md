# 꼬리질문 로직 전면 개편 -- 설계 문서

> 입력: `_workspace/00_input.md`
> 작성자: interview-designer
> 대상: ai-engineer (프롬프트), frontend-dev (UI/상태), qa-engineer (테스트 케이스)

---

## 1. State Machine -- 상태 전이 재설계

### 현재 상태 전이 (AS-IS)

```
briefing → ready → recording → generating-followup →
  ├─ followup-ready → followup-recording → next
  └─ no followup → next
```

### 새로운 상태 전이 (TO-BE)

```
briefing → ready → recording → reviewing →
  ├─ followup-ready → followup-recording → next
  └─ no followup → next
```

**변경 핵심**: `generating-followup` 단계가 `reviewing`으로 변경된다. 이 단계에서 STT 교정 완료를 기다린 뒤 Haiku에게 판단 + 생성을 한 번에 요청한다.

### 상태 전이 테이블

| 현재 상태 | 이벤트 | 다음 상태 | 조건 |
|----------|--------|----------|------|
| `ready` | 답변 시작 (버튼/자동) | `recording` | stream 존재 |
| `recording` | 답변 완료 (버튼/타임아웃) | `reviewing` | -- |
| `reviewing` | 5초 미만 답변 | `ready` (다음 질문) | `recordingDuration < 5` |
| `reviewing` | 자기소개/마무리 질문 | `ready` (다음 질문) | `questionId === 'beh-intro' or 'beh-lastq'` |
| `reviewing` | 꼬리질문 잔여 횟수 소진 | `ready` (다음 질문) | `followUpCount >= maxFollowUps` |
| `reviewing` | STT + Haiku 완료, 꼬리질문 필요 | `followup-ready` | Haiku `needed: true` |
| `reviewing` | STT + Haiku 완료, 꼬리질문 불필요 | `ready` (다음 질문) | Haiku `needed: false` |
| `reviewing` | STT 실패 폴백 | 아래 폴백 로직 참조 | -- |
| `reviewing` | Haiku 타임아웃/에러 | `ready` (다음 질문) | catch 처리 |
| `followup-ready` | 답변 시작 | `followup-recording` | stream 존재 |
| `followup-recording` | 답변 완료 | `ready` (다음 질문) | -- |

### reviewing 단계 내부 시퀀스

```
[recording 종료]
  │
  ├─ (1) 녹화 blob 저장 + 프레임 저장
  ├─ (2) 사전 필터: 5초 미만 → 즉시 다음 질문
  ├─ (3) 사전 필터: 자기소개/마무리 → 즉시 다음 질문
  ├─ (4) 사전 필터: 꼬리질문 횟수 소진 → 즉시 다음 질문
  │
  ├─ (5) phase = 'reviewing' (UI: "면접관이 답변을 검토 중입니다")
  ├─ (6) Whisper STT 실행 (await)
  ├─ (7) LLM 교정 실행 (await)
  ├─ (8) 교정 결과 → Haiku 판단+생성 호출 (await)
  │
  ├─ (9a) needed: true → followup-ready
  └─ (9b) needed: false → next question
```

**핵심 변경**: 기존에는 Web Speech API의 실시간 roughTranscript를 바로 Sonnet에 넘겼다. 새 플로우에서는 Whisper STT + LLM 교정이 완료된 정확한 텍스트를 Haiku에 넘긴다.

---

## 2. Follow-up Decision Criteria -- 꼬리질문 판단 루브릭

Haiku가 교정된 답변 텍스트를 받아 아래 3가지 기준을 체크한다. **3가지 모두 충족하면 PASS (꼬리질문 불필요)**, 하나라도 미충족이면 해당 유형의 꼬리질문을 생성한다.

### 판단 기준 (3-Criteria Check)

| # | 기준 | PASS 조건 | FAIL 조건 |
|---|------|-----------|-----------|
| **C1** | 질문 의도 부합 | 질문이 묻는 핵심 포인트에 대해 직접적으로 답변함 | 질문을 회피하거나 관계없는 이야기만 함 |
| **C2** | 구체적 사례/경험 | 실제 경험, 프로젝트, 상황 등 구체적 사례가 1개 이상 언급됨 | 일반론, 교과서적 답변, "~할 것 같습니다" 류의 가정만 있음 |
| **C3** | 본인 역할/행동 명시 | "제가 ~했습니다", "저는 ~를 담당했습니다" 등 본인의 구체적 행동이 명시됨 | 팀이 했다는 이야기만 있고 본인의 역할이 불분명 |

### 판단 우선순위

1. C1 FAIL → `evasion` 유형 꼬리질문
2. C1 PASS, C2 FAIL → `abstract` 유형 꼬리질문
3. C1 PASS, C2 PASS, C3 FAIL → `role-unclear` 유형 꼬리질문
4. C1 PASS, C2 PASS, C3 PASS → PASS (꼬리질문 불필요)

---

## 3. Follow-up Question Types -- 꼬리질문 유형 5종

| 유형 ID | 결핍 유형 | 트리거 조건 | 꼬리질문 방향 | 예시 |
|---------|----------|-----------|-------------|------|
| `evasion` | 질문 회피 | C1 FAIL: "잘 모르겠습니다", "경험이 없습니다", 또는 질문과 무관한 답변 | 가상 시나리오로 전환하여 사고 과정 확인 | "직접 경험하지 못했더라도, 만약 [질문 상황]이 발생한다면 어떤 순서로 접근하시겠어요?" |
| `abstract` | 추상적 답변 | C2 FAIL: 일반론만 진술, 구체적 사례 없음 | 답변 속 키워드를 인용하며 구체적 사례 요청 | "아까 '[답변 중 키워드]'라고 하셨는데, 실제로 그렇게 했던 프로젝트가 있으면 말씀해주시겠어요?" |
| `role-unclear` | 역할 불분명 | C3 FAIL: 팀 성과만 언급, 본인 행동 미명시 | 답변 속 구체적 활동을 인용하며 본인 기여분 질문 | "그 프로젝트에서 '[구체 활동]'을 하셨다고 했는데, 그 과정에서 본인이 직접 맡은 역할은 무엇이었나요?" |
| `result-missing` | 결과 누락 | C1 PASS + C2 PASS + C3 PASS이지만 결과/교훈 언급 없음 (Haiku 추가 판단) | 과정은 설명했지만 결과가 빠진 경우 결과 확인 | "그 상황을 해결하신 뒤 결과가 어떻게 됐는지, 그리고 그 경험에서 어떤 점을 배우셨는지 말씀해주시겠어요?" |
| `incomplete` | 답변 불완전 | 녹화 5~15초 + 교정 텍스트 30자 미만 (극히 짧은 답변) | 보충 기회 제공 | "답변이 짧았는데, 관련된 경험이나 생각을 조금 더 말씀해주시겠어요?" |

### 유형 적용 규칙

- `result-missing`은 C1/C2/C3 모두 PASS여도 Haiku가 추가 판단하여 생성 가능. 단, 빈도 제어에 의해 억제될 수 있음
- `incomplete`은 Haiku 호출 전 사전 필터에서 처리 (텍스트 길이 기반)
- 모든 꼬리질문은 반드시 답변 내용의 특정 키워드/사건을 인용해야 함 (generic 질문 금지)
- "좀 더 구체적으로", "자세히 설명해주시겠어요" 같은 포괄적 질문은 금지

---

## 4. Haiku Prompt Design -- 시스템 프롬프트

### 모델

`anthropic/claude-3-5-haiku-latest` (OpenRouter 경유)

### 호출 방식

판단 + 생성을 **1회 호출**로 처리한다. JSON mode 사용.

### 시스템 프롬프트

```
당신은 면접 패널의 일원입니다. 지원자의 답변을 3가지 기준으로 평가하고, 필요 시 꼬리질문을 생성합니다.

## 면접관 패널
${nameList}

## 3가지 판단 기준 (모두 충족 시 PASS)

1. **질문 의도 부합 (C1)**: 질문의 핵심 포인트에 직접 답변했는가?
   - PASS: 질문이 묻는 내용에 대해 직접적으로 답함
   - FAIL: 질문을 회피하거나, 전혀 관련 없는 이야기만 함

2. **구체적 사례 (C2)**: 실제 경험이나 프로젝트를 1개 이상 언급했는가?
   - PASS: 실제 프로젝트명, 상황, 시기 등 구체적 사례가 있음
   - FAIL: "~할 것 같습니다", "~하는 게 중요합니다" 같은 일반론만 있음

3. **본인 역할 (C3)**: 본인이 직접 한 행동/역할을 명시했는가?
   - PASS: "제가 ~했습니다", "저는 ~를 담당" 등 본인 행동이 명확함
   - FAIL: "저희 팀이 ~했습니다"만 있고 본인의 구체적 기여가 불분명

## 꼬리질문 유형

C1 FAIL → evasion: 가상 시나리오로 전환하여 사고 과정 확인
C2 FAIL → abstract: 답변 속 키워드를 인용하며 구체적 사례 요청
C3 FAIL → role-unclear: 답변 속 활동을 인용하며 본인 역할 질문
3개 모두 PASS이지만 결과/교훈 완전 누락 → result-missing: 결과 확인

## 빈도 제어 (매우 중요)

현재까지 이 면접에서 꼬리질문이 ${followUpCount}회 발생했습니다.
최대 허용 횟수는 ${maxFollowUps}회입니다.
- 남은 횟수가 0이면 반드시 needed: false를 반환하세요.
- 남은 횟수가 1이면 C1 FAIL(evasion)인 경우에만 꼬리질문을 생성하세요.
- 애매한 경우에는 꼬리질문을 생성하지 마세요. 평가 리포트에서 충분히 지적할 수 있습니다.

## 꼬리질문 생성 규칙

- 반드시 답변 내용에서 특정 키워드, 프로젝트명, 사건을 인용하며 질문할 것
- 금지 표현: "좀 더 구체적으로", "자세히 설명해주시겠어요", "예시를 들어주시겠어요", "더 말씀해주실 것이 있나요"
- 꼬리질문은 1문장으로. 면접관 말투에 맞게.

반드시 아래 JSON 형식으로만 응답:

꼬리질문이 필요한 경우:
{
  "c1": true/false,
  "c2": true/false,
  "c3": true/false,
  "deficiency": "evasion|abstract|role-unclear|result-missing",
  "needed": true,
  "question": "꼬리질문 내용",
  "evaluatorId": "질문하는 면접관 id",
  "reason": "1줄 판단 이유"
}

꼬리질문이 불필요한 경우:
{
  "c1": true,
  "c2": true,
  "c3": true,
  "needed": false
}
```

### User 메시지

```
[메인 질문] ${questionText}
[답변 (STT 교정 완료)] ${correctedTranscript}
[녹화 시간] ${recordingDuration}초
```

### 호출 파라미터

| 파라미터 | 값 | 이유 |
|---------|-----|------|
| `model` | `anthropic/claude-3-5-haiku-latest` | 비용 절감, 속도 향상 |
| `maxTokens` | `512` | 판단 + 1문장 질문에 충분 |
| `temperature` | `0.3` | 판단 일관성 유지, 질문 표현에 약간의 다양성 |
| `jsonMode` | `true` | 파싱 안정성 |
| `timeoutMs` | `8000` | 아래 타이밍 섹션 참조 |

---

## 5. Timing -- 각 단계 예상 소요 시간

### reviewing 단계 타임라인

| 단계 | 예상 소요 시간 | 비고 |
|------|-------------|------|
| 녹화 정리 (blob 저장) | ~100ms | 동기 처리 |
| 사전 필터 (5초/자기소개/횟수 체크) | ~10ms | 즉시 판단, 필터 통과 시 reviewing 진입 안 함 |
| Whisper STT | 2~5초 | 답변 길이에 비례, base 모델 기준 |
| LLM 교정 (Sonnet) | 1~3초 | 현재와 동일 |
| Haiku 판단+생성 | 0.5~1.5초 | Haiku 속도 |
| **총 reviewing 시간** | **3.5~9.5초** | 대부분 5~7초 예상 |

### 사용자 체감 대기 시간

- 사전 필터에 걸리는 경우 (5초 미만, 자기소개 등): **0초** (즉시 다음 질문)
- 정상 reviewing: **5~7초** (프로그레스 바로 체감 시간 완화)
- 최악의 경우 (긴 답변 + 네트워크 지연): **~12초** (타임아웃 전 완료)

### 타임아웃 전략

| 대상 | 타임아웃 | 폴백 |
|------|---------|------|
| Whisper STT | 15초 | STT 실패 폴백 로직 적용 (섹션 8 참조) |
| LLM 교정 | 10초 | 교정 없이 raw transcript 사용 |
| Haiku 판단 | 8초 | 꼬리질문 스킵, 다음 질문으로 |
| reviewing 전체 | 20초 | 어떤 단계든 20초 초과 시 강제 다음 질문 |

---

## 6. Hard Mode Compatibility -- 하드모드 통합

### 하드모드에서의 reviewing 동작

하드모드의 핵심 특성: 질문 표시 시 타이핑 애니메이션 → 3-2-1 카운트다운 → 자동 녹화 시작.

reviewing 단계는 하드모드에서도 동일하게 적용된다. 시퀀스:

```
[recording 종료 (버튼 or 시간초과)]
  │
  ├─ phase = 'reviewing'
  ├─ UI: 프로그레스 바 + "면접관이 답변을 검토 중입니다"
  ├─ (STT → 교정 → Haiku 판단)
  │
  ├─ 꼬리질문 필요:
  │   ├─ phase = 'ready' + isFollowUp = true
  │   ├─ 타이핑 애니메이션 시작 (꼬리질문 텍스트)
  │   ├─ 3-2-1 카운트다운
  │   └─ 자동 녹화 시작 (제한시간 3분)
  │
  └─ 꼬리질문 불필요:
      ├─ nextQuestion() → phase = 'ready'
      ├─ 타이핑 애니메이션 시작 (다음 메인 질문 텍스트)
      ├─ 3-2-1 카운트다운
      └─ 자동 녹화 시작
```

### 기존 타이핑 useEffect 변경 사항

현재 `useEffect` 의존성에 `isGenerating`이 포함되어 있어 `isGenerating === true`일 때 타이핑을 시작하지 않는다. 새 설계에서는 `isGenerating` 대신 `phase === 'reviewing'`을 조건으로 사용한다.

```
// AS-IS
if (phase !== 'ready' || isGenerating) return

// TO-BE
if (phase !== 'ready') return
// reviewing 상태에서는 phase가 'ready'가 아니므로 자연스럽게 차단됨
```

### 하드모드 꼬리질문 제한시간

- 꼬리질문 답변: 180초 (3분) 고정 -- 현재와 동일
- 시간 초과 시 자동 `handleStopFollowUp()` -- 현재와 동일

---

## 7. Frequency Control -- 빈도 제어

### 제어 변수

| 변수 | 타입 | 설명 |
|------|------|------|
| `followUpCount` | `number` | 현재 세션에서 발생한 꼬리질문 누적 횟수 |
| `maxFollowUps` | `number` | 최대 허용 횟수 (기본값: 질문 5개 기준 2~3) |

### maxFollowUps 산정 공식

```
maxFollowUps = Math.min(3, Math.ceil(questions.length * 0.5))
```

- 질문 3개 → 최대 2개
- 질문 5개 → 최대 3개
- 질문 7개 → 최대 3개 (상한 3)

### 프론트엔드 카운터 관리

`followUpCount`는 `InterviewPage.jsx`의 `useRef`로 관리한다 (리렌더 불필요, 세션 내 유지).

```
const followUpCountRef = useRef(0)
```

꼬리질문이 실제로 생성될 때 `followUpCountRef.current++` 한다.

### 3단계 억제 로직

1. **프론트엔드 사전 필터** (Haiku 호출 전):
   - `followUpCount >= maxFollowUps` → Haiku 호출하지 않고 즉시 다음 질문

2. **Haiku 프롬프트 내 빈도 정보** (LLM 레벨 제어):
   - 현재 횟수와 최대 횟수를 프롬프트에 전달
   - 남은 횟수 1 → evasion만 허용
   - 남은 횟수 0 → 무조건 불필요 반환

3. **프론트엔드 최종 검증** (Haiku 응답 후):
   - Haiku가 `needed: true`를 반환해도 `followUpCount >= maxFollowUps`이면 무시
   - LLM 환각 방어용 이중 안전장치

---

## 8. Fallback -- 폴백 처리

### 시나리오별 폴백

| 시나리오 | 조건 | 폴백 동작 |
|---------|------|----------|
| **STT 완전 실패** | Whisper가 에러를 throw하거나 빈 결과 | 녹화 시간 기반 폴백 적용 (아래 참조) |
| **STT 환각** | 교정 결과가 빈 문자열 (기존 환각 감지 로직) | 녹화 시간 기반 폴백 적용 |
| **교정 실패** | correctTranscript가 에러 | raw transcript로 Haiku 호출 시도 |
| **교정 타임아웃** | 10초 초과 | raw transcript로 Haiku 호출 시도 |
| **Haiku 타임아웃** | 8초 초과 | 꼬리질문 스킵, 다음 질문 |
| **Haiku JSON 파싱 실패** | safeParseJSON 실패 | 꼬리질문 스킵, 다음 질문 |
| **Haiku 환각** | 응답에 `needed` 필드 없음 | 꼬리질문 스킵, 다음 질문 |
| **reviewing 전체 타임아웃** | 20초 초과 | 모든 처리 중단, 다음 질문 |

### 녹화 시간 기반 폴백 (STT 없이 판단)

STT가 실패하면 텍스트 없이 녹화 시간만으로 간이 판단한다.

| 녹화 시간 | 판단 | 동작 |
|----------|------|------|
| 5초 미만 | 답변 의사 없음 | 꼬리질문 없이 다음 질문 (사전 필터에서 이미 처리) |
| 5~15초 | 극히 짧은 답변 | `incomplete` 유형 꼬리질문 (하드코딩): "답변이 짧았는데, 비슷한 상황을 경험하지 못했더라도 어떻게 접근하실지 말씀해주시겠어요?" |
| 15~30초 | 판단 불가 | 꼬리질문 없이 다음 질문 (리포트에서 "STT 실패로 텍스트 분석 불가" 표기) |
| 30초 이상 | 충분히 답변 | 꼬리질문 없이 다음 질문 |

### 폴백 메시지 처리

- STT 실패 시 `updateAnswer`에 `sttFailed: true` 플래그 추가
- 리포트 분석 단계에서 해당 질문은 비전(영상) 분석만 수행, 텍스트 분석은 "음성 인식에 실패하여 텍스트 분석을 수행하지 못했습니다"로 대체

---

## 9. UI Requirements -- 프론트엔드 표시 요구사항

### reviewing 상태 오버레이

`phase === 'reviewing'` 일 때 캠 프리뷰 위에 표시할 오버레이:

| 요소 | 설명 |
|------|------|
| **배경** | 반투명 검정 오버레이 (bg-black/60) -- 기존 `isGenerating` 오버레이와 동일 |
| **프로그레스 바** | 상단에 가로 프로그레스 바, 3단계 진행 표시 |
| **상태 텍스트** | 현재 단계에 따라 변경 |
| **점 애니메이션** | 기존 analyzing-dots 애니메이션 재사용 |

### 프로그레스 바 3단계

| 단계 | 진행률 | 텍스트 |
|------|--------|--------|
| STT 처리 중 | 0~40% | "답변을 텍스트로 변환하고 있습니다..." |
| 교정 중 | 40~70% | "답변 내용을 정리하고 있습니다..." |
| 검토 중 | 70~100% | "면접관이 답변을 검토하고 있습니다..." |

**구현 방식**: 실제 API 콜백 기반이 아닌 시간 기반 시뮬레이션. reviewing 진입 시 0%에서 시작, 2초 후 40%, 4초 후 70%, 이후 느리게 증가. 실제 완료 시 100%로 점프.

이유: STT/교정/Haiku 각 단계의 정확한 진행률을 추적하기 어려우므로, 사용자 체감을 위한 시뮬레이션이 적합하다.

### 하단 버튼 영역

| 상태 | 버튼 |
|------|------|
| `reviewing` | "검토 중..." (disabled) -- 기존 `isGenerating` 때와 동일 |
| `followup-ready` (일반모드) | "답변 시작" 버튼 |
| `followup-ready` (하드모드) | "답변 곧 시작" (disabled) -- 타이핑+카운트다운 자동 진행 |

### 꼬리질문 태그 표시

꼬리질문이 표시될 때 deficiency 유형에 따른 시각적 구분은 **하지 않는다**. 면접자에게 "당신의 답변이 추상적이었다"는 인상을 주면 안 되기 때문이다. 기존과 동일하게 "꼬리질문" 뱃지만 표시한다.

단, `deficiency` 유형은 `answers[idx].followUp.deficiency`에 저장하여 리포트 분석 시 활용한다.

---

## 부록: 기존 코드 변경 포인트 요약

### `src/lib/api/interview.js`

| 변경 | 내용 |
|------|------|
| `generateFollowUp` 함수 시그니처 변경 | `correctedTranscript` 파라미터 추가, `roughTranscript` 제거 |
| 모델 변경 | `anthropic/claude-sonnet-4` → `anthropic/claude-3-5-haiku-latest` |
| 빈도 제어 파라미터 추가 | `followUpCount`, `maxFollowUps` |
| 사전 필터 로직 정리 | 5초 미만 스킵, 30초 이상 스킵 제거 (Haiku에게 판단 위임) |
| 프롬프트 전면 교체 | 3-Criteria Check + 유형별 꼬리질문 + 빈도 제어 |

### `src/pages/InterviewPage.jsx`

| 변경 | 내용 |
|------|------|
| `isGenerating` 상태 → `phase === 'reviewing'` | 별도 state 제거, phase로 통합 |
| `handleStopAnswer` 리팩토링 | reviewing 시퀀스 (STT await → 교정 await → Haiku await) |
| Web Speech API 의존 제거 | `speechRef`, `roughTranscriptRef`, `initSpeech`, `startSpeech`, `stopSpeech` 전부 제거 |
| `followUpCountRef` 추가 | `useRef(0)`, 꼬리질문 생성 시 increment |
| 프로그레스 바 컴포넌트 추가 | reviewing 오버레이 내부 |
| reviewing 전체 타임아웃 추가 | `AbortController` + `setTimeout(20000)` |

### `src/stores/interviewStore.js`

| 변경 | 내용 |
|------|------|
| `followUp` 객체에 `deficiency` 필드 추가 | `"evasion" / "abstract" / "role-unclear" / "result-missing" / "incomplete"` |
| `followUp` 객체에 `c1`, `c2`, `c3` 필드 추가 | 판단 결과 저장 (리포트 분석용) |

---

## 부록: Web Speech API 제거 범위

현재 Web Speech API는 꼬리질문 판단을 위한 실시간 roughTranscript 수집에만 사용된다. 새 플로우에서는 Whisper STT 결과를 기다리므로 Web Speech API가 완전히 불필요해진다.

제거 대상:
- `speechRef` ref
- `roughTranscriptRef` ref
- `initSpeech()` 함수
- `startSpeech()` / `stopSpeech()` 함수
- `useEffect(() => { initSpeech() }, [])` 훅
- `handleStartAnswer` / `handleStartFollowUp` 내 `startSpeech()` 호출
- `handleStopAnswer` / `handleStopFollowUp` 내 `stopSpeech()` 호출
- `handleExit` 내 `stopSpeech()` 호출
- `processing useEffect` 내 `stopSpeech()` 호출

이로 인해 `window.SpeechRecognition` 미지원 브라우저(Firefox, Safari)에서의 동작 제약이 해소된다.
