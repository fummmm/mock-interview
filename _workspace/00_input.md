# 작업 요청: 3가지 이슈 수정

## 이슈 1: 꼬리질문 미작동 (Critical Bug)

### 증상
- 2회 플로우 테스트에서 꼬리질문이 한 번도 발생하지 않음
- 성실/러프 답변 모두 꼬리질문 0건
- reviewing 프로그레스바는 정상 작동

### 근본 원인 (진단 완료)
- `659e8f1` 커밋에서 reviewing 단계에 **20초 전체 타임아웃** 설정 (InterviewPage.jsx:327-331)
- 파이프라인: Whisper STT → Sonnet 교정 → Haiku 꼬리질문 판단
- **Whisper base 모델이 30~60초 녹음을 브라우저에서 처리하면 20초 이상 소요**
- 타임아웃이 먼저 터져 `generateFollowUp()`이 실행되기도 전에 catch 블록으로 이동
- catch 블록에서 `nextQuestion()` 호출 → 꼬리질문 스킵

### 관련 파일
- `src/pages/InterviewPage.jsx` (handleStopAnswer, line 286-478)
- `src/lib/api/interview.js` (generateFollowUp, line 118-251)
- `src/lib/whisper.js` (transcribeAudio)

---

## 이슈 2: 체감 대기시간 과다 → 롤백 고려

### 증상
- 꼬리질문 없이도 reviewing 단계 대기시간이 체감상 길다
- 사용자: "꼬리질문도 있었으면 더 피로했을 거야. 이전으로 롤백하는 거 고려해봐야겠어."

### 원인
- `659e8f1` 이전 플로우: Web Speech rough transcript → 즉시 Haiku 판단 → 바로 다음 질문 (background STT)
- `659e8f1` 이후 플로우: recording → **blocking reviewing** (Whisper + Sonnet + Haiku) → 다음 질문
- 사용자가 reviewing 프로그레스바 앞에서 10~20초+ 대기해야 함

### 이전 플로우 (b153e64) 참고
```
recording → stopRecording() → processInBackground(Whisper STT)
                             → roughTranscript(Web Speech) → generateFollowUp(Haiku)
                             → 꼬리질문 또는 다음 질문 (즉시 전환)
```

### 현재 플로우 (659e8f1+e6fd20e)
```
recording → stopRecording() → reviewing 진입 (프로그레스바 표시)
                             → Whisper STT (blocking, 10~60초)
                             → correctTranscript (blocking, 3~8초)
                             → generateFollowUp (blocking, 1~3초)
                             → 20초 타임아웃에 의해 대부분 강제 종료
```

---

## 이슈 3: STT 답변 잘림 (MediaRecorder 레이스 컨디션)

### 증상 (반복 발생)
| 날짜 | 문항 | 녹음(초) | 마지막 텍스트 |
|------|------|---------|-------------|
| 04-06 | Q2 | 43 | "굉장히" (문장 중간) |
| 04-06 | Q4 | 52 | "정답이 정해져 있지 않은" (문장 중간) |
| 04-03 | Q4 | 48 | "그 부분을" (문장 중간) |
| 03-31 | Q3 | 9 | "반드시." (극초반 중단) |

### 근본 원인
- `useMediaRecorder.js:29`: `recorder.start(1000)` — 1초 단위 청크
- `useMediaRecorder.js:52-65`: `onstop` 이벤트에서 `chunksRef.current`로 Blob 생성
- `recorder.stop()` 호출 시 마지막 `ondataavailable` 청크가 아직 도착 안 함
- `onstop`이 먼저 발화 → 불완전한 Blob → 잘린 STT

### 수정 방향
- `stop()` 전에 `requestData()` 호출로 마지막 청크 강제 플러시
- `ondataavailable` 완료 확인 후 Blob 생성
- 관련 파일: `src/hooks/useMediaRecorder.js`
