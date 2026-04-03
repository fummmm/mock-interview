---
name: ai-prompt-engineering
description: "AI 프롬프트 엔지니어링 가이드. OpenRouter API 활용 패턴, 질문 생성/답변 분석/비전 분석 프롬프트 설계, LLM 응답 파싱, 토큰 최적화를 제공한다. ai-engineer 에이전트가 프롬프트를 작성하거나 튜닝할 때 참조한다. '프롬프트', 'LLM', 'OpenRouter', '분석 품질', '토큰 최적화', '질문 생성 프롬프트', '답변 분석', '비전 분석' 키워드에 트리거된다. 단, Supabase 스키마나 UI 컴포넌트 구현은 이 스킬의 범위가 아니다."
---

# AI Prompt Engineering — 프롬프트 엔지니어링 가이드

ai-engineer 에이전트가 LLM 프롬프트를 설계하고 최적화할 때 활용하는 패턴 레퍼런스.

## 대상 에이전트

`ai-engineer` — 이 스킬의 패턴을 프롬프트 설계에 직접 적용한다.

## OpenRouter API 패턴

### 호출 구조
```javascript
// api/openrouter.js를 통해 호출
const response = await fetch('/api/openrouter', {
  method: 'POST',
  body: JSON.stringify({
    model: 'model-name',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: 2000
  })
});
```

### 모델 선택 기준
| 작업 | 권장 특성 | 이유 |
|------|----------|------|
| 질문 생성 | 고성능, 높은 creativity | 다양하고 자연스러운 질문 |
| 답변 분석 | 고성능, 낮은 temperature | 정확하고 일관된 평가 |
| 꼬리질문 생성 | 중간 성능 | 빠른 응답 + 적절한 품질 |
| 비전 분석 | 비전 지원 모델 | 이미지 입력 필수 |

## 프롬프트 설계 원칙

1. **구조화된 출력 요구**: JSON 형식 명시, 필드명과 타입 정의
2. **역할 명시**: "당신은 면접관입니다" — 페르소나 설정
3. **컨텍스트 제공**: 면접 유형, 난이도, 지원자 정보
4. **제약 조건 명시**: 질문 수, 난이도 범위, 금지 주제
5. **예시 포함**: few-shot으로 원하는 출력 형식 시연

## 프롬프트 유형별 패턴

### 질문 생성 (2단계)

**1단계 — 주제 추출:**
- 시스템: 이력서/포트폴리오에서 면접 가능한 주제를 추출하는 전문가
- 입력: 이력서/포폴 텍스트
- 출력: JSON — `[{ topic, importance: "major"|"minor", category }]`
- 제약: major/minor 비율 유지, 중복 없는 주제

**2단계 — 질문 생성:**
- 시스템: 면접관 역할
- 입력: 추출된 주제 + 난이도 + 면접 유형
- 출력: JSON — `[{ question, topic, difficulty, expectedPoints }]`
- 제약: 주제당 1~2개 질문, 난이도 분포 균등

### 답변 분석
- 시스템: 면접 평가 전문가
- 입력: 질문 + 답변 텍스트 + 평가 기준
- 출력: JSON — `{ scores: { logic, specificity, expertise, communication }, feedback, overallScore }`
- 제약: 점수 범위 1~10, 피드백은 구체적 근거 포함

### 비전 분석
- 시스템: 비언어적 커뮤니케이션 분석 전문가
- 입력: 영상 프레임 이미지들
- 출력: JSON — `{ eyeContact, posture, expression, gesture, feedback }`
- 제약: 점수 범위 1~10, 개선 포인트 포함

### 꼬리질문 생성
- 시스템: 면접관 — 답변 심화 탐색
- 입력: 원래 질문 + 답변 텍스트
- 출력: JSON — `{ followUpQuestion, targetKeyword, depth }`
- 제약: 답변에서 구체화 가능한 포인트 선택

## LLM 응답 파싱 안전 패턴

```javascript
function safeParse(response) {
  try {
    return JSON.parse(response);
  } catch {
    // markdown 코드 블록에서 추출 시도
    const match = response.match(/```json?\s*([\s\S]*?)```/);
    if (match) return JSON.parse(match[1]);
    return null; // 폴백 트리거
  }
}
```

### 파싱 실패 대응
1. 재시도 1회 (temperature를 낮춰서)
2. 폴백: 기본 평가 텍스트 반환
3. 에러 로깅으로 실패 패턴 수집

## 토큰 최적화

| 전략 | 절감량 | 방법 |
|------|--------|------|
| 불필요한 지시 제거 | 10~20% | 반복/모호한 지시 정리 |
| 컨텍스트 압축 | 15~30% | 이력서 요약 후 전달 |
| 출력 형식 제한 | 10~15% | 필요한 필드만 요청 |
| 모델 다운그레이드 | — | 간단한 작업에 경량 모델 |

## 프롬프트 변경 시 체크리스트

- [ ] 기존 프롬프트 전문 읽기
- [ ] 변경 영향 범위 분석 (다른 프롬프트와의 의존성)
- [ ] JSON 출력 스키마 변경 시 프론트엔드 파싱 코드도 확인
- [ ] temperature, max_tokens 적절성 검토
- [ ] 엣지케이스 테스트 (빈 입력, 매우 긴 입력, 특수문자)
