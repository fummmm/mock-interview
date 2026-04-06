# 꼬리질문 플로우 수정 설계서 (v2)

> 이전 설계: reviewing 블로킹 방식 (659e8f1) -- **20초 타임아웃 < Whisper 처리시간 문제로 꼬리질문 100% 실패**
> 작성자: interview-designer
> 대상: frontend-dev (상태 머신/파이프라인), ai-engineer (프롬프트), qa-engineer (검증)

---

## 0. 문제 진단 요약

### 근본 원인

```
recording → stopRecording()
  → reviewing 진입 (프로그레스바 표시, 블로킹)
  → Whisper STT [10~60초, 녹음 길이에 비례]     ← 여기서 이미 20초 초과
  → correctTranscript(Sonnet) [3~8초]            ← 도달하지 못함
  → generateFollowUp(Haiku) [1~3초]              ← 도달하지 못함
  → 20초 전체 타임아웃 → catch → nextQuestion()   ← 꼬리질문 100% 스킵
```

핵심 병목: **브라우저 내 Whisper base 모델(Xenova/whisper-base)**의 처리 속도. 30초 녹음 기준 약 15~30초, 60초 녹음 기준 30~60초 소요. 이 병목은 모델 크기/하드웨어에 의존하므로 클라이언트 사이드에서 근본적으로 해결 불가.

### 사용자 피드백 핵심

1. 꼬리질문 한 번도 못 받음 (기능 고장)
2. 대기시간 체감이 큼 (UX 저하)
3. 이전 방식(b153e64)으로 롤백 고려 중

---

## 1. 옵션별 비교 분석

### Option A: 완전 롤백 (b153e64, Web Speech 방식)

**플로우**
```
recording → stopRecording()
  → processInBackground(Whisper STT) [비동기, 논블로킹]
  → roughTranscript(Web Speech API) [이미 수집됨]
  → generateFollowUp(Haiku, roughTranscript) [1~3초]
  → 꼬리질문 즉시 표시 또는 다음 질문 즉시 전환
```

| 항목 | 평가 |
|------|------|
| **대기시간** | 거의 0초 (Web Speech 실시간 수집) |
| **꼬리질문 정확도** | 낮음 (Web Speech 한국어 인식률 60~70%, 오인식 빈번) |
| **브라우저 호환성** | 나쁨 (Chrome/Edge만 지원, Firefox/Safari 불가) |
| **안정성** | 낮음 (Web Speech API 자체가 불안정, 중간에 끊기는 현상 빈번) |
| **구현 난이도** | 높음 (롤백 자체는 쉬우나, 이후 659e8f1에서 추가된 개선사항 재적용 필요) |
| **비용** | 변동 없음 |

**장점**: 대기시간 제로에 가까운 UX
**단점**: Web Speech API를 제거한 이유(불안정, 브라우저 제한)가 그대로 되살아남. rough transcript 기반 Haiku 판단은 오판 위험 높음.

---

### Option B: 타임아웃 증가 + 스킵 버튼

**플로우**
```
recording → stopRecording()
  → reviewing 진입 (프로그레스바 + 스킵 버튼)
  → Whisper STT [10~60초]
  → correctTranscript(Sonnet) [3~8초]
  → generateFollowUp(Haiku, correctedTranscript) [1~3초]
  → 60~90초 전체 타임아웃 (또는 사용자 스킵)
```

| 항목 | 평가 |
|------|------|
| **대기시간** | 매우 김 (15~70초 블로킹), 스킵 시 꼬리질문 포기 |
| **꼬리질문 정확도** | 높음 (교정된 transcript 기반) |
| **브라우저 호환성** | 좋음 (Web Speech 불필요) |
| **안정성** | 보통 (타임아웃 문제는 해결, 대기시간 문제는 남음) |
| **구현 난이도** | 매우 낮음 (타임아웃 값 수정 + 버튼 1개 추가) |
| **비용** | 변동 없음 |

**장점**: 최소 변경으로 "꼬리질문이 아예 안 되는" 문제 해소
**단점**: 핵심 불만인 "대기시간 체감"이 오히려 악화됨. 스킵 버튼이 있으면 대부분 스킵할 것이므로 사실상 꼬리질문 기능 무력화. 면접이라는 맥락에서 "스킵" 옵션 자체가 부자연스러움.

---

### Option C: 하이브리드 (Background STT + Haiku 빠른 판단) -- 추천안

**핵심 아이디어**: Whisper STT를 완전 백그라운드(논블로킹)로 전환하되, 꼬리질문 판단은 **녹음 시간 + Haiku 빠른 판단**으로 수행. Haiku에게 "교정된 정확한 transcript" 대신 **녹음 메타데이터(시간, 질문 유형) + 간이 신호**를 주고 판단시킨다.

단, "간이 신호"만으로 Haiku가 양질의 꼬리질문을 만들 수 없으므로, 좀 더 정교한 변형을 제안한다.

**변형 C-1: 2-Phase 접근 (추천)**

Phase 1 (즉시, 0~3초): Whisper 완료를 기다리지 않고, **녹음 시간 기반 heuristic**으로 꼬리질문 대상 여부만 판단
Phase 2 (STT 완료 후, 백그라운드): 정확한 transcript로 분석 리포트 생성

```
recording → stopRecording()
  ├─ [Phase 1: 즉시 판단, 0~3초]
  │   ├─ 사전 필터: <5초, 자기소개/마무리, 횟수 소진 → 즉시 다음 질문
  │   ├─ 5~15초 → incomplete 하드코딩 꼬리질문 (즉시)
  │   ├─ 15~30초 → Haiku 빠른 판단 (질문 텍스트 + "답변 약 20초, 내용 불명") [1~2초]
  │   └─ 30초+ → 꼬리질문 스킵, 다음 질문
  │
  ├─ [Phase 2: 백그라운드, 논블로킹]
  │   ├─ Whisper STT (10~60초)
  │   ├─ Sonnet 교정 (3~8초)
  │   └─ 결과를 answers[idx]에 저장 (리포트 분석용)
  │
  └─ 꼬리질문 있으면 → followup-ready → followup-recording → next
     꼬리질문 없으면 → 즉시 next question
```

**문제점**: 15~30초 구간에서 Haiku에게 답변 내용을 전달할 수 없으므로, 꼬리질문 품질이 낮아질 수밖에 없다. "구체적 키워드를 인용하며 질문"하라는 기존 루브릭을 충족 불가.

**변형 C-2: Background STT + 조건부 대기 (최종 추천)**

핵심: "짧은 답변"은 STT도 빨리 끝나므로 잠깐 기다려도 된다. "긴 답변"은 STT가 오래 걸리지만, 어차피 충분히 답했을 확률이 높으므로 꼬리질문이 불필요할 가능성이 높다.

```
recording → stopRecording()
  ├─ 사전 필터: <5초, 자기소개/마무리, 횟수 소진 → 즉시 다음 질문 (0초)
  │
  ├─ [녹음 시간 기반 분기]
  │   │
  │   ├─ 5~15초 (극히 짧은 답변)
  │   │   → incomplete 하드코딩 꼬리질문 (즉시, STT 불필요)
  │   │   → 백그라운드 STT 시작 (리포트용)
  │   │
  │   ├─ 15~45초 (꼬리질문 판단 대상)
  │   │   → reviewing 진입 (프로그레스바)
  │   │   → Whisper STT 대기 (최대 12초 타임아웃)
  │   │   → STT 성공 시: Haiku 판단 (교정 스킵, raw transcript 직접 사용) [1~3초]
  │   │   → STT 타임아웃 시: 꼬리질문 스킵, 다음 질문
  │   │   → 백그라운드에서 Sonnet 교정 계속 (리포트용)
  │   │
  │   └─ 45초+ (충분한 답변)
  │       → 꼬리질문 스킵 (다음 질문으로 즉시 전환)
  │       → 백그라운드 STT + 교정 (리포트용)
  │
  └─ 꼬리질문 있으면 → followup-ready
     꼬리질문 없으면 → 즉시 next question
```

| 항목 | 평가 |
|------|------|
| **대기시간** | 0~15초 (구간별 차등, 대부분 0~5초) |
| **꼬리질문 정확도** | 중상 (15~45초 구간은 raw transcript 기반이라 교정 없음, 하지만 의미 파악은 충분) |
| **브라우저 호환성** | 좋음 (Web Speech 불필요) |
| **안정성** | 높음 (각 단계별 타임아웃, 폴백 명확) |
| **구현 난이도** | 중간 (기존 reviewing 로직 리팩토링, 백그라운드 STT 파이프라인 분리) |
| **비용** | 약간 감소 (Sonnet 교정을 꼬리질문 판단에서 제외, 리포트 분석 시에만 사용) |

---

### Option D: 서버사이드 STT (Groq Whisper API)

**플로우**
```
recording → stopRecording()
  → reviewing 진입
  → audioBlob을 서버로 전송 → Groq Whisper API (2~5초)
  → correctTranscript(Sonnet) [3~8초]
  → generateFollowUp(Haiku) [1~3초]
  → 총 6~16초
```

| 항목 | 평가 |
|------|------|
| **대기시간** | 6~16초 (서버 STT가 훨씬 빠름, 하지만 업로드 시간 추가) |
| **꼬리질문 정확도** | 매우 높음 (Groq Whisper large-v3는 한국어 인식률 높음) |
| **브라우저 호환성** | 좋음 |
| **안정성** | 외부 API 의존 (Groq 서비스 장애 시 fallback 필요) |
| **구현 난이도** | 높음 (서버 엔드포인트 신규 구축, 오디오 업로드 로직, API 키 관리, Vercel 10초 제한 우회) |
| **비용** | 추가 발생 (Groq API 비용, 또는 무료 티어 한도 관리 필요) |

**장점**: STT 품질과 속도 모두 압도적으로 개선
**단점**: 외부 API 의존도 증가, 비용 발생, Vercel Serverless 10초 타임아웃 제약으로 직접 호출 필요(API 키 클라이언트 노출 또는 별도 서버 필요). 현재 아키텍처("서버/API 키 불필요, 완전 무료" 원칙)와 충돌.

---

## 2. 옵션 비교표

| 기준 | **A: 완전 롤백** | **B: 타임아웃 증가** | **C-2: 하이브리드 (추천)** | **D: 서버 STT** |
|------|:---:|:---:|:---:|:---:|
| **대기시간** | 0초 | 15~70초 | 0~15초 | 6~16초 |
| **꼬리질문 정확도** | 낮음 | 높음 | 중상 | 매우 높음 |
| **꼬리질문 발생률** | 중간 (오판 포함) | 높음 (대기 끝까지 간 경우) | 중간 (대상 구간 한정) | 높음 |
| **브라우저 호환** | Chrome/Edge만 | 전체 | 전체 | 전체 |
| **구현 난이도** | 높음 (롤백+재적용) | 매우 낮음 | 중간 | 높음 |
| **추가 비용** | 없음 | 없음 | 없음 | Groq API 비용 |
| **기존 원칙 준수** | 부분 위반 (Web Speech 재도입) | 준수 | 준수 | 위반 (외부 API 추가) |
| **UX 자연스러움** | 좋음 | 나쁨 | 좋음 | 보통 |

---

## 3. 추천안: Option C-2 (Background STT + 조건부 대기)

### 추천 이유

1. **핵심 문제 해결**: 꼬리질문 100% 실패 문제를 완전히 해결하면서도 대기시간을 대폭 줄임
2. **실용적 트레이드오프**: 꼬리질문 판단에 Sonnet 교정을 빼고 raw transcript를 직접 사용하면, Whisper 오인식이 포함되더라도 Haiku가 "답변이 질문 의도에 부합하는지, 구체적 사례가 있는지, 본인 역할이 있는지"를 판단하기에는 충분함. 교정이 필요한 것은 "리포트 출력용 텍스트"이지, "꼬리질문 판단"이 아님.
3. **녹음 시간별 차등 전략**: 
   - 짧은 답변(5~15초): STT 없이도 "incomplete"로 확실히 판단 가능 → 즉시 꼬리질문
   - 중간 답변(15~45초): STT가 비교적 빠르게 끝남(15~45초 녹음은 Whisper base로 5~15초) → 12초 타임아웃 내 처리 가능성 높음
   - 긴 답변(45초+): 충분히 답변한 것이므로 꼬리질문 스킵이 합리적
4. **비용 중립**: 추가 API 비용 없음, Sonnet 호출 1회 절감(꼬리질문 판단 시)
5. **점진적 개선 가능**: 추후 Option D(서버 STT)를 추가하면 중간 구간(15~45초)의 정확도를 더 높일 수 있음

### 핵심 인사이트: "교정은 리포트용, 판단은 raw로 충분"

기존 설계의 실수는 꼬리질문 판단에도 Sonnet 교정을 거치도록 한 것이었다. 교정이 필요한 이유는 리포트에서 면접자에게 보여줄 텍스트를 정확하게 만들기 위함이다. 하지만 "이 답변이 질문에 맞는 답인가?"를 Haiku가 판단하는 데는 raw transcript로도 충분하다. Whisper가 "유니트"를 "유니티"로 못 바꿔도, "게임 엔진 프로젝트를 했다"는 맥락은 파악 가능하다.

---

## 4. 추천안 상세 구현 스펙

### 4.1 상태 머신 재설계

```
briefing → ready → recording →
  ├─ [사전 필터: 즉시] → next (ready or processing)
  ├─ [5~15초: 즉시] → followup-ready (incomplete)
  ├─ [15~45초: reviewing] → followup-ready 또는 next
  └─ [45초+: 즉시] → next (ready or processing)
```

### 4.2 상태 전이 테이블

| 현재 상태 | 이벤트 | 다음 상태 | 조건 |
|----------|--------|----------|------|
| `ready` | 답변 시작 | `recording` | stream 존재 |
| `recording` | 답변 완료 | (분기) | -- |
| (분기) | `<5초` 또는 자기소개/마무리/횟수소진 | `ready` (다음 질문) | 사전 필터 |
| (분기) | `5~15초` | `ready` (isFollowUp) | incomplete 하드코딩 |
| (분기) | `15~45초` | `reviewing` | STT + Haiku 대기 |
| (분기) | `45초+` | `ready` (다음 질문) | 충분한 답변 판단 |
| `reviewing` | STT + Haiku 완료, 꼬리질문 필요 | `ready` (isFollowUp) | `needed: true` |
| `reviewing` | STT + Haiku 완료, 꼬리질문 불필요 | `ready` (다음 질문) | `needed: false` |
| `reviewing` | STT 타임아웃 (12초) | `ready` (다음 질문) | 폴백 |
| `reviewing` | Haiku 타임아웃/에러 | `ready` (다음 질문) | 폴백 |
| `followup-ready` | 답변 시작 | `followup-recording` | stream 존재 |
| `followup-recording` | 답변 완료 | `ready` (다음 질문) | -- |

### 4.3 handleStopAnswer 파이프라인 상세

```
handleStopAnswer():
  │
  ├─ (1) 녹화 정리: stopCapture(), stopRecording()
  ├─ (2) blob + frames 저장: updateAnswer(idx, {...})
  │
  ├─ (3) recordingDuration 확인
  │
  ├─ [분기 A: 사전 필터]
  │   ├─ <5초 → nextQuestion() (return)
  │   ├─ beh-intro / beh-lastq → nextQuestion() (return)
  │   └─ followUpCount >= maxFollowUps → nextQuestion() (return)
  │
  ├─ [분기 B: 5~15초 (incomplete)]
  │   ├─ 하드코딩 꼬리질문 즉시 세팅
  │   ├─ setFollowUpQuestion(...), setIsFollowUp(true), setPhase('ready')
  │   ├─ 백그라운드 STT 시작 (incPendingSTT, 리포트용)
  │   └─ return
  │
  ├─ [분기 C: 15~45초 (꼬리질문 대상)]
  │   ├─ setPhase('reviewing'), startReviewProgress()
  │   │
  │   ├─ Whisper STT 시작 (12초 타임아웃)
  │   │   ├─ 성공: rawText 획득
  │   │   └─ 타임아웃/실패: stopReviewProgress(), nextQuestion() (return)
  │   │
  │   ├─ Haiku 판단+생성 (rawText 기반, 교정 없음, 8초 타임아웃)
  │   │   ├─ needed: true → 꼬리질문 세팅, setPhase('ready')
  │   │   └─ needed: false / 에러 → nextQuestion()
  │   │
  │   ├─ stopReviewProgress()
  │   │
  │   └─ 백그라운드: Sonnet 교정 시작 (리포트용, 논블로킹)
  │       ├─ correctTranscript(rawText, questionText, track)
  │       └─ 결과를 updateAnswer(idx, { transcript: corrected })
  │
  └─ [분기 D: 45초+ (충분한 답변)]
      ├─ nextQuestion() (즉시)
      └─ 백그라운드 STT + 교정 시작 (리포트용, 논블로킹)
```

### 4.4 타이밍 예상

| 구간 | 사용자 대기시간 | 꼬리질문 가능성 |
|------|-------------|-------------|
| **<5초** | 0초 | 없음 (답변 의사 없음) |
| **5~15초** | 0초 | 있음 (incomplete 하드코딩) |
| **15~45초** | 3~15초 (reviewing) | 있음 (STT 성공 시 Haiku 판단) |
| **45초+** | 0초 | 없음 (충분한 답변) |

15~45초 구간 상세:
- 15초 녹음: Whisper ~3~5초 → Haiku 1~2초 = **총 4~7초 대기**
- 30초 녹음: Whisper ~7~12초 → Haiku 1~2초 = **총 8~14초 대기**
- 45초 녹음: Whisper ~12초+ → **12초 타임아웃 가능성 있음**

### 4.5 Haiku 호출 변경사항

기존: `generateFollowUp(questionText, correctedTranscript, evaluators, questionId, recordingDuration)`
변경: `generateFollowUp(questionText, rawTranscript, evaluators, questionId, recordingDuration)`

**Haiku 프롬프트 변경 포인트**:
- 입력 텍스트가 "STT 교정 완료" 대신 "Whisper raw 인식 결과"임을 명시
- "STT 오인식이 있을 수 있으므로, 단어 하나하나가 아니라 답변의 전체 흐름과 의미에 집중하여 판단하라"는 지시 추가
- user 메시지의 라벨을 `[답변 (STT 교정 완료)]`에서 `[답변 (음성 인식 원본, 오인식 포함 가능)]`으로 변경

### 4.6 reviewing UI 처리 방안

#### 프로그레스바: 유지, 단 구간 조정

reviewing이 발생하는 15~45초 구간에서만 프로그레스바가 표시된다. 기존 3단계를 2단계로 축소:

| 단계 | 진행률 | 텍스트 | 시간 |
|------|--------|--------|------|
| STT 처리 중 | 0~70% | "답변을 분석하고 있습니다" | 0~10초 |
| 검토 중 | 70~100% | "면접관이 답변을 검토하고 있습니다" | 10~15초 |

"답변 내용을 정리하고 있습니다" (교정 단계) 텍스트를 제거. 교정은 백그라운드에서 수행되므로 사용자에게 노출할 이유 없음.

#### 캠 블러: 유지

`phase === 'reviewing'` 조건 그대로 유지.

#### 하단 버튼: 기존과 동일

reviewing 시 "검토 중..." 비활성 버튼 표시.

### 4.7 백그라운드 STT 파이프라인

모든 구간에서 Whisper STT + Sonnet 교정은 백그라운드에서 실행된다. 기존 `handleStopFollowUp`의 백그라운드 STT 패턴을 재사용.

```
// 패턴: 세션 ID 체크 + incPendingSTT/decPendingSTT
const mySession = useInterviewStore.getState().sessionId
incPendingSTT()
;(async () => {
  try {
    if (useInterviewStore.getState().sessionId !== mySession) return
    const sttResult = await transcribeAudio(result.blob)
    if (useInterviewStore.getState().sessionId !== mySession) return
    const corrected = await correctTranscript(sttResult.transcript, questionText, track)
    if (useInterviewStore.getState().sessionId !== mySession) return
    // 결과 저장
    updateAnswer(idx, {
      rawTranscript: sttResult.transcript,
      transcript: corrected,
      fillerWordCount: sttResult.fillerWordCount,
      silenceSegments: sttResult.silencePositions,
    })
  } catch (e) {
    console.warn(`[백그라운드] Q${idx + 1} STT 실패:`, e.message)
  } finally {
    if (useInterviewStore.getState().sessionId === mySession) decPendingSTT()
  }
})()
```

**중요**: 15~45초 구간에서 reviewing 중 STT가 완료되면, 그 rawText로 Haiku를 호출한 뒤, 이어서 백그라운드로 Sonnet 교정을 실행해야 한다. 즉, 같은 STT 결과를 "꼬리질문 판단용"과 "리포트 교정용"으로 이중 활용한다.

### 4.8 하드모드 호환성

하드모드 동작은 기존과 동일. reviewing이 끝나면 `setPhase('ready')` → 타이핑 애니메이션 → 카운트다운 → 자동 녹화 시작. 변경사항 없음.

### 4.9 빈도 제어

기존 설계(01_design.md v1)의 빈도 제어 로직을 그대로 유지:
- `followUpCountRef = useRef(0)`
- `maxFollowUps = Math.min(3, Math.ceil(questions.length * 0.5))`
- 3단계 억제: 프론트엔드 사전 필터 → Haiku 프롬프트 → 프론트엔드 최종 검증

### 4.10 45초 기준의 근거

왜 45초인가:
1. **Whisper base 처리 속도**: 45초 녹음은 Whisper base로 약 12~18초 소요. 12초 타임아웃 내 완료 확률이 50% 미만으로 떨어지는 지점.
2. **꼬리질문 필요성**: 45초 이상 답변은 내용이 충분할 확률이 높음. 3-Criteria Check에서 3개 모두 PASS일 가능성이 높아 Haiku를 호출해봐야 `needed: false`가 나올 확률이 높음.
3. **비용 대비 효과**: 45초+ 구간에서 12초 이상 대기시켜가며 꼬리질문을 시도하는 것은 사용자 경험 대비 얻는 가치가 적음.

이 수치는 실제 운영 데이터를 수집한 뒤 조정 가능. 초기값으로 45초가 합리적.

---

## 5. 관련 파일 변경 목록

| 파일 | 변경 유형 | 내용 |
|------|----------|------|
| `src/pages/InterviewPage.jsx` | 수정 (핵심) | `handleStopAnswer` 리팩토링 -- 녹음 시간별 4분기 로직, 백그라운드 STT 파이프라인 분리 |
| `src/lib/api/interview.js` | 수정 | `generateFollowUp` -- user 메시지 라벨 변경, raw transcript 기반 판단 안내 프롬프트 추가 |
| `src/pages/InterviewPage.jsx` | 수정 | reviewing 프로그레스바 3단계 → 2단계, 텍스트 변경 |
| `src/stores/interviewStore.js` | 변경 없음 | 기존 구조 유지 (followUp.deficiency, c1/c2/c3 이미 있음) |
| `src/lib/whisper.js` | 변경 없음 | transcribeAudio 함수 그대로 사용 |
| `src/hooks/useMediaRecorder.js` | 변경 없음 (이슈 3에서 별도 수정) | -- |

### 변경하지 않는 것

- Web Speech API 재도입 없음
- 새 외부 API 추가 없음
- Whisper 모델 변경 없음
- 기존 reviewing UI 컴포넌트 구조 유지 (프로그레스바, 캠 블러, 점 애니메이션)

---

## 6. 폴백 정리

| 시나리오 | 조건 | 대기시간 | 동작 |
|---------|------|---------|------|
| 답변 <5초 | 사전 필터 | 0초 | 다음 질문 |
| 자기소개/마무리 | 사전 필터 | 0초 | 다음 질문 |
| 꼬리질문 횟수 소진 | 사전 필터 | 0초 | 다음 질문 |
| 답변 5~15초 | incomplete | 0초 | 하드코딩 꼬리질문 |
| 답변 15~45초, STT 성공 | reviewing | 3~15초 | Haiku 판단 |
| 답변 15~45초, STT 타임아웃 | reviewing 12초 | 12초 | 다음 질문 (꼬리질문 스킵) |
| 답변 15~45초, Haiku 에러 | reviewing | 3~15초 | 다음 질문 (꼬리질문 스킵) |
| 답변 45초+ | 즉시 | 0초 | 다음 질문 |

---

## 7. 리스크 및 한계

### 알려진 한계

1. **15~45초 구간의 STT 타임아웃 가능성**: 30~45초 녹음은 12초 타임아웃에 걸릴 수 있음. 이 경우 꼬리질문이 스킵되지만, 기존(100% 실패)보다는 확실히 개선됨.
2. **Raw transcript 기반 판단의 정확도 저하**: Whisper base의 한국어 오인식이 포함된 텍스트로 Haiku가 판단하므로, 교정된 텍스트 대비 정확도가 약간 낮을 수 있음. 하지만 "의미 파악" 수준에서는 큰 차이 없음.
3. **45초+ 구간의 꼬리질문 기회 상실**: 45초 이상 답변한 면접자가 C1/C2/C3 중 하나를 미충족하더라도 꼬리질문을 받지 못함. 이는 의도적 트레이드오프.

### 향후 개선 방향

1. **Option D 부분 도입**: Groq Whisper API를 15~45초 구간에만 선택적으로 사용하면, STT 속도를 2~5초로 단축 가능. 비용 vs 품질 트레이드오프 판단 필요.
2. **45초 기준 조정**: 실제 운영 데이터(녹음 시간 분포, 꼬리질문 판정률)를 수집한 뒤 기준값 최적화.
3. **Whisper 모델 업그레이드**: `whisper-base` → `whisper-small`로 업그레이드하면 인식 정확도 향상되지만 처리 시간도 증가. 브라우저 하드웨어 스펙에 따라 결정.

---

## 부록: 기존 설계서(v1)에서 유지되는 항목

다음 항목들은 v1 설계서에서 그대로 유지한다:

- 3-Criteria Check (C1/C2/C3) 판단 루브릭
- 꼬리질문 5유형 (evasion, abstract, role-unclear, result-missing, incomplete)
- Haiku 프롬프트 기본 구조 (판단+생성 1회 호출)
- 빈도 제어 3단계 억제 로직
- 꼬리질문 태그 표시 방식 (deficiency 유형은 사용자에게 노출하지 않음)
- interviewStore의 followUp 객체 구조 (deficiency, c1, c2, c3 필드)
- STT 실패 시 폴백 (sttFailed 플래그, 리포트 분석 시 비전 분석만 수행)
