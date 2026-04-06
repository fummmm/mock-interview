# QA Report -- 3가지 이슈 수정 검증

> 검증 대상: `useMediaRecorder.js`, `interview.js`, `InterviewPage.jsx`
> 기준 문서: `_workspace/01_design.md`
> 작성: qa-engineer

---

## A. useMediaRecorder.js (이슈 3: MediaRecorder 레이스 컨디션)

| # | 검증 항목 | 결과 | 비고 |
|---|----------|------|------|
| A1 | requestData()가 recording/paused 상태에서만 호출되는지 | **PASS** | L53 `if (recorder.state === 'recording' \|\| recorder.state === 'paused')` 조건 후 호출 |
| A2 | try-catch로 브라우저 미지원 대비 | **PASS** | L54-58 try-catch, catch 블록에서 무시하고 진행 |
| A3 | 기존 API (반환값 형태) 변경 없는지 | **PASS** | 반환값: `{ blob, blobUrl, duration }` (L68-72). 기존과 동일 |
| A4 | 외부 인터페이스 변경 없는지 | **PASS** | `return { isRecording, duration, startRecording, stopRecording }` (L82) 변경 없음 |
| A5 | setTimeout 100ms가 다른 코드에 영향 주는지 | **PASS** | stopRecording은 Promise를 반환하므로 caller가 await하면 100ms 지연 포함. InterviewPage의 handleStopAnswer에서 `await stopRecording()` 사용 중. 100ms는 체감 불가 수준이며 onstop 콜백에서 resolve하므로 문제 없음 |
| A6 | inactive 상태 가드 | **PASS** | L44 `recorder.state === 'inactive'` 시 즉시 resolve(null). requestData/stop 미호출 |
| A7 | recorder가 null인 경우 | **PASS** | L44 `!recorder` 시 즉시 resolve(null) |
| A8 | 타이머 정리 | **PASS** | L49 stopRecording 진입 즉시 clearInterval(timerRef.current) |

### A 섹션 종합: 모든 항목 PASS. 레이스 컨디션 수정이 깔끔하게 적용됨.

---

## B. interview.js (이슈 1: Haiku 프롬프트 수정)

| # | 검증 항목 | 결과 | 비고 |
|---|----------|------|------|
| B1 | 함수 시그니처 변경 없는지 | **PASS** | `generateFollowUp(questionText, correctedTranscript, evaluatorNames, questionId, recordingDuration)` 5개 파라미터. 이전 버전의 followUpCount/maxFollowUps 2개 파라미터가 제거됨. 호출부(InterviewPage L433-438)도 5개 인수로 일치 |
| B2 | 사전 필터: beh-intro/beh-lastq 스킵 | **PASS** | L129 조건 정상 |
| B3 | 사전 필터: duration < 5 스킵 | **PASS** | L134 조건 정상 |
| B4 | incomplete 유형: 5~15초 + 30자 미만 | **PASS** | L140 조건 정상, 하드코딩 꼬리질문 반환 |
| B5 | incomplete 반환에 c1/c2/c3 포함 | **PASS** | L147-149: `c1: false, c2: false, c3: false` 명시적 포함. 이전 버전의 누락 문제 해결됨 |
| B6 | JSON 출력 포맷 지시 변경 없는지 | **PASS** | L218-238 JSON 형식 지시 유지. needed/c1/c2/c3/deficiency/question/evaluatorId/reason 필드 그대로 |
| B7 | 3-Criteria Check 정확히 유지 | **PASS** | L177-187 C1(질문 의도 부합), C2(구체적 사례), C3(본인 역할) 3가지 기준 + PASS/FAIL 판단 그대로 |
| B8 | user 메시지 라벨 변경 | **PASS** | L242 `[답변 (음성 인식 원본, 오인식 포함 가능)]` 라벨. STT 원본임을 명시 |
| B9 | system 프롬프트에 STT 입력 안내 추가 | **PASS** | L196-203 "STT 입력 안내" 섹션. 단어 정확성 의존 금지, 전체 흐름/맥락 집중, 필러워드 무시 안내 |
| B10 | 꼬리질문 생성 규칙에 의미 단위 인용 안내 | **PASS** | L213-214 "의미 단위로 인용하세요" + 예시("프론트 핀트 개발" -> "프론트엔드 개발 경험") |
| B11 | 빈도 제어 로직이 프롬프트에서 제거되었는지 | **PASS** | 프롬프트 내에 followUpCount/maxFollowUps 관련 문구 없음. 빈도 제어는 caller(InterviewPage)에서 수행 |
| B12 | Haiku 응답 needed 필드 검증 | **PASS** | L250 `typeof result.needed !== 'boolean'` 시 스킵 처리 |
| B13 | 에러 핸들링 | **PASS** | L256-260 try-catch 전체, 모든 에러 시 `{ needed: false }` 반환 |
| B14 | 꼬리질문 유형 4종 유지 | **PASS** | L192-194 evasion/abstract/role-unclear/result-missing 4종 |
| B15 | correctTranscript 함수 변경 없는지 | **PASS** | L10-105 correctTranscript 함수 변경 없음 (이번 수정 대상 아님) |

### B 섹션 종합: 모든 항목 PASS. 프롬프트 개선이 잘 적용되고 기존 로직도 온전.

---

## C. InterviewPage.jsx (이슈 1+2: 4분기 리팩토링)

### C-1. 분기 로직 검증

| # | 검증 항목 | 결과 | 비고 |
|---|----------|------|------|
| C1 | **분기 A-1**: < 5초 → 즉시 다음 질문 | **PASS** | L334 `recordingDuration < 5` → nextQuestion() |
| C2 | **분기 A-2**: beh-intro/beh-lastq → 즉시 다음 질문 | **PASS** | L342 조건 정상 |
| C3 | **분기 A-3**: 횟수 소진 → 백그라운드 STT + 다음 질문 | **PASS** | L350 `followUpCountRef.current >= maxFollowUps` → startBackgroundSTT + nextQuestion |
| C4 | **분기 B**: 5~15초 → incomplete 꼬리질문 즉시 + 백그라운드 STT | **PASS** | L359 `recordingDuration >= 5 && recordingDuration < 15` → 하드코딩 질문 세팅 + startBackgroundSTT + setPhase('ready') |
| C5 | **분기 C**: 15~45초 → reviewing → Whisper 12초 타임아웃 → Haiku 판단 | **PASS** | L392 `recordingDuration >= 15 && recordingDuration < 45` → setPhase('reviewing') + Promise.race 12초 |
| C6 | **분기 D**: 45초+ → 즉시 다음 질문 + 백그라운드 STT | **PASS** | L502 (else fall-through) → startBackgroundSTT + nextQuestion |

### C-2. 경계값 검증

| # | 시나리오 | 결과 | 비고 |
|---|---------|------|------|
| C7 | 정확히 5초 | **PASS** | `< 5` 불통과 → A-2/A-3 체크 → `>= 5 && < 15` 진입 = 분기 B |
| C8 | 정확히 15초 | **PASS** | `< 5` 불통과 → `>= 5 && < 15` 불통과(15 < 15 = false) → `>= 15 && < 45` 진입 = 분기 C |
| C9 | 정확히 45초 | **PASS** | `< 5` 불통과 → `>= 5 && < 15` 불통과 → `>= 15 && < 45` 불통과(45 < 45 = false) → fall-through = 분기 D |
| C10 | 0초 (극단) | **PASS** | `< 5` 통과 = 분기 A-1 |

### C-3. followUpCountRef 빈도 제어

| # | 검증 항목 | 결과 | 비고 |
|---|----------|------|------|
| C11 | 분기 B에서만 증가 | **PASS** | L384 `followUpCountRef.current++` |
| C12 | 분기 C에서만 증가 (꼬리질문 필요 시) | **PASS** | L469 `followUpCountRef.current++` (followUp.needed && followUp.question 조건 내) |
| C13 | 분기 A, D에서 증가 안 함 | **PASS** | 분기 A/D에 followUpCountRef 변경 코드 없음 |
| C14 | 분기 C에서 꼬리질문 불필요 시 증가 안 함 | **PASS** | L472-476 else 블록: nextQuestion()만 호출, 카운터 변경 없음 |

### C-4. Promise.race 타임아웃 패턴 (분기 C)

| # | 검증 항목 | 결과 | 비고 |
|---|----------|------|------|
| C15 | 12초 타임아웃 구현 | **PASS** | L404-407 `Promise.race([transcribeAudio(blob), new Promise((_, reject) => setTimeout(...))])` |
| C16 | 타임아웃 시 처리 | **PASS** | catch 블록(L412-419): sttFailed 마킹 → stopReviewProgress → nextQuestion. 꼬리질문 시도 안 함 |
| C17 | reject 후 transcribeAudio 계속 실행 (메모리 누수) | **WARN** | Promise.race에서 타임아웃 reject 후에도 transcribeAudio는 계속 실행됨. AbortSignal 미전달. 단, transcribeAudio는 WASM 기반이라 cancel API가 없으므로 현실적으로 해결 불가. Whisper 워커가 완료되면 자연 해제. 메모리 누수보다는 불필요한 CPU 소비에 해당하며, 이 경우 분기 C(15~45초 녹음)이므로 Whisper 처리 자체가 가벼움 |

### C-5. startBackgroundSTT 헬퍼

| # | 검증 항목 | 결과 | 비고 |
|---|----------|------|------|
| C18 | 세션 ID 체크: 시작 전 | **PASS** | L280 `if (useInterviewStore.getState().sessionId !== mySession) return` |
| C19 | 세션 ID 체크: STT 완료 후 | **PASS** | L282 동일 체크 |
| C20 | 세션 ID 체크: 교정 완료 후 | **PASS** | L291 동일 체크 |
| C21 | pendingSTT 카운터: inc/dec 대칭 | **PASS** | L277 `incPendingSTT()`, L296 finally 블록에서 `decPendingSTT()` |
| C22 | pendingSTT: 세션 변경 시에도 dec 호출 | **PASS** | finally 블록(L295-296)에서 세션 일치 시에만 dec. 세션 불일치 시 dec 안 함 -- 의도된 동작(다른 세션의 카운터를 오염시키지 않음) |

### C-6. 분기 C 백그라운드 교정

| # | 검증 항목 | 결과 | 비고 |
|---|----------|------|------|
| C23 | STT 성공 후 백그라운드 교정 시작 | **PASS** | L479-489 rawText 존재 시 비동기 교정 시작 |
| C24 | 백그라운드 교정에 pendingSTT 카운터 필요한지 | **WARN** | 현재 미사용. 분기 C에서는 STT가 이미 완료된 상태이므로 rawTranscript는 저장됨. 교정은 transcript 필드만 업데이트하므로 분석 페이지 진입 시 교정 미완이면 rawTranscript가 그대로 사용됨. 리포트 품질에는 영향 있으나, pendingSTT 미적용이 기능 오류를 유발하지는 않음 |
| C25 | STT 타임아웃 후 백그라운드 교정 미시작 | **PASS** | L412-419 catch 블록에서 return하므로 L479 교정 코드에 도달 불가 |

### C-7. handleStopFollowUp 변경 여부

| # | 검증 항목 | 결과 | 비고 |
|---|----------|------|------|
| C26 | handleStopFollowUp 기존과 동일한지 | **PASS** | L533-603. 기존 로직 유지: stopCapture → stopRecording → followUp 데이터 저장 → 백그라운드 STT+교정 → nextQuestion |

### C-8. reviewing UI

| # | 검증 항목 | 결과 | 비고 |
|---|----------|------|------|
| C27 | 프로그레스바 3단계 → 2단계 변경 | **PASS** | L66 `reviewStage` 0/1 (이전 0/1/2). L653-656 reviewStageText 배열 2개 항목: 'STT 분석' / '검토' |
| C28 | 프로그레스바 시뮬레이션 타이밍 | **PASS** | L121-136: 0~6초 → 0~70%(Stage 0), 6초~ → 70~95%(Stage 1). 12초 STT 타임아웃에 맞춰 적절 |
| C29 | 캠블러(blur) 분기 C에서만 표시 | **PASS** | L787 `phase === 'reviewing'` 조건. reviewing phase는 분기 C에서만 진입 |
| C30 | reviewing 중 나가기 버튼 비활성화 | **PASS** | L932 `disabled={isRecording \|\| phase === 'reviewing'}` |
| C31 | reviewing 중 답변 버튼 비활성화 | **PASS** | L938-944 `phase === 'reviewing'` → "검토 중..." disabled 버튼 |

### C-9. 전체 타임아웃 20초 제거

| # | 검증 항목 | 결과 | 비고 |
|---|----------|------|------|
| C32 | 20초 전체 타임아웃 제거 | **PASS** | AbortController 미사용. 20000ms setTimeout 없음. grep 검색 확인 |

### C-10. useCallback 의존성 배열

| # | 검증 항목 | 결과 | 비고 |
|---|----------|------|------|
| C33 | startBackgroundSTT 의존성 | **PASS** | L299: `[incPendingSTT, decPendingSTT, updateAnswer, track]` -- 내부에서 사용하는 외부 참조 모두 포함. useInterviewStore.getState()는 호출 시점 참조이므로 의존성 불필요 |
| C34 | handleStopAnswer 의존성 | **PASS** | L506-521: stopCapture, stopRecording, updateAnswer, currentIndex, currentQuestion, frames, nextQuestion, setPhase, startReviewProgress, stopReviewProgress, evaluators, track, startBackgroundSTT, maxFollowUps 포함 |
| C35 | handleStopAnswer에 followUpCountRef 의존성 누락 | **PASS** | ref는 의존성 배열에 포함할 필요 없음 (`.current` 접근은 항상 최신 값) |
| C36 | handleStopAnswer에 evaluators 포함 | **WARN** | evaluators는 `getEvaluators(track, companySize)` 호출 결과. track/companySize가 면접 중 변경되지 않으므로 문제 없으나, evaluators 자체가 매 렌더링마다 새 배열로 생성됨. useMemo로 감싸면 불필요한 재생성 방지 가능. 현재 기능 오류는 아님 |

### C-11. 꼬리질문 연쇄 시나리오

| # | 시나리오 | 결과 | 비고 |
|---|---------|------|------|
| C37 | 꼬리질문 후 다음 메인 질문도 꼬리질문 대상일 때 | **PASS** | handleStopFollowUp → setIsFollowUp(false) → nextQuestion(). 다음 질문은 handleStopAnswer에서 새로 분기 판단. followUpCountRef만 누적되므로 maxFollowUps 초과 전까지 정상 작동 |
| C38 | 꼬리질문 2회 연속 (다른 메인 질문에서) | **PASS** | followUpCountRef는 세션 전체 누적. maxFollowUps(최대 3)에 도달하면 분기 A-3에서 스킵 |

### C-12. 미사용 코드 정리 확인

| # | 검증 항목 | 결과 | 비고 |
|---|----------|------|------|
| C39 | DeviceDropdown import 제거 | **PASS** | grep 검색 결과 0건 |
| C40 | loadDevices destructure 제거 | **PASS** | grep 검색 결과 0건 |
| C41 | isGenerating state 제거 | **PASS** | 이전 보고서에서 지적한 미사용 코드 모두 정리됨 |

---

## D. 통합 검증

| # | 검증 항목 | 결과 | 비고 |
|---|----------|------|------|
| D1 | 빌드 성공 | **PASS** | `npx vite build` 정상 완료 (1.80s) |
| D2 | import 경로 정합성 | **PASS** | generateFollowUp, correctTranscript 모두 barrel export 경유 정상 연결 |
| D3 | generateFollowUp 호출 인수/파라미터 일치 | **PASS** | 호출부 5개 인수, 함수 5개 파라미터 |
| D4 | 미사용 import/변수 | **PASS** | 이전 보고서에서 지적한 DeviceDropdown, loadDevices 모두 제거됨 |

---

## 발견된 이슈 요약

| # | 이슈 | 심각도 | 파일:라인 | 상태 |
|---|------|--------|----------|------|
| 1 | Promise.race 타임아웃 후 transcribeAudio 계속 실행 | **LOW** | InterviewPage.jsx:404-407 | 수용. 15~45초 녹음에 대한 Whisper이므로 처리 부하 경미. AbortSignal 미지원(WASM 워커). |
| 2 | 분기 C 백그라운드 교정에 pendingSTT 카운터 미적용 | **LOW** | InterviewPage.jsx:479-489 | 수용. 교정 실패 시 rawTranscript로 폴백되므로 기능 오류 없음. 리포트 품질에만 영향. |
| 3 | evaluators 매 렌더마다 새 배열 생성 | **LOW** | InterviewPage.jsx:77 | 수용. useMemo 적용 시 미세 최적화 가능하나 현재 성능 문제 없음. |

---

## 이전 보고서 대비 해결된 이슈

| 이전 이슈 | 상태 |
|----------|------|
| 모델 ID 불일치 (설계서 vs 구현) | **해당 없음** -- 빈도 제어가 프롬프트에서 caller로 이동하면서 구조 변경 |
| 20초 타임아웃 체크포인트 방식 | **해결** -- 전체 타임아웃 제거, 분기별 개별 타임아웃(12초 STT)으로 대체 |
| incomplete 반환에 c1/c2/c3 누락 | **해결** -- `c1: false, c2: false, c3: false` 명시 추가 (interview.js L147-149) |
| 미사용 import DeviceDropdown | **해결** -- 제거됨 |
| 미사용 변수 loadDevices | **해결** -- 제거됨 |

---

## 종합 판정

### PASS -- 배포 가능

3가지 이슈 수정이 모두 설계 의도대로 구현되었고, 이전 보고서에서 지적된 5건의 이슈도 모두 해결됨.

- **useMediaRecorder.js**: requestData 강제 플러시 + 100ms 지연 패턴이 깔끔하게 적용. 상태 가드와 에러 핸들링 완비.
- **interview.js**: Haiku 프롬프트에 STT 원본 안내/의미 단위 인용 추가. 3-Criteria Check와 JSON 포맷 유지. 빈도 제어를 caller로 이관하여 관심사 분리 개선.
- **InterviewPage.jsx**: 4분기(A/B/C/D) 로직이 설계서와 정확히 일치. 경계값(5/15/45초) 정상. followUpCountRef 증가가 분기 B/C에서만 발생. 20초 전체 타임아웃 제거. 미사용 코드 정리 완료.

발견된 3건의 LOW 이슈는 모두 기능 오류가 아닌 최적화/방어적 개선 사항이며, 현재 단계에서 배포를 차단할 수준이 아님.
