/**
 * 면접 분석 관련 API - 텍스트 분석, 비전 분석
 */
import { callOpenRouter, safeParseJSON, getTrackLabel, getEvaluatorConfig } from './client'

/**
 * 텍스트 분석 - 3명 평가자
 */
export async function analyzeText({ questions, answers, track, companySize = 'medium' }) {
  const answersText = answers
    .map((a, i) => {
      let text = `[질문 ${i + 1}] ${a.questionText}\n[답변] ${a.transcript || '(답변 없음)'}\n[녹화 시간] ${a.recordingDuration}초`
      if (a.followUp && a.followUp.question) {
        text += `\n[꼬리질문] ${a.followUp.question}\n[꼬리질문 답변] ${a.followUp.transcript || '(답변 없음)'}`
      }
      return text
    })
    .join('\n\n---\n\n')

  const trackLabel = getTrackLabel(track)
  const evaluatorConfig = getEvaluatorConfig(track, trackLabel, companySize)

  const systemPrompt = `당신은 면접 평가 시스템입니다.
이 서비스는 취업 준비 수강생이 튜터와의 1:1 모의면접 전에 연습하는 도구입니다.

아래 면접 답변에 대해 3명의 면접관이 각각 독립적으로 평가합니다.

## 면접관 구성
${evaluatorConfig.prompt}

## 평가 기준 (각 0~100점)
- relevance: 질문 의도 파악 및 답변 적합성
- structure: 체계적 답변 구조 (도입-본론-마무리, 사례 중심)
- keywords: 핵심 키워드 활용 (인성면접: 협업/소통/성장 등 역량 키워드)
- specificity: 구체적 사례/수치 제시

## 채점 기준
${
  companySize === 'large'
    ? `[대기업 모드] 높은 수준의 답변을 요구합니다. 관대하게 채점하지 마세요.

점수 분포 가이드:
- 85~100: 탁월한 답변 (구체적 사례 + 수치 근거 + 논리적 구조 + 핵심 키워드 + 차별화된 인사이트)
- 70~84: 양호한 답변 (기본 구조는 갖췄으나 깊이나 구체성이 부족)
- 50~69: 보통 답변 (내용은 있지만 평범하고 차별점 없음)
- 30~49: 부족한 답변 (핵심이 빠지거나 추상적, 사례 부재)
- 0~29: 매우 부족 (내용 없음, 질문 미이해, 답변 거부)

대기업 감점 기준:
- 구체적 수치/성과 없이 "열심히 했다" 식의 답변: 최대 60점
- 상황-과제-행동-결과 구조 없이 나열식 답변: structure 최대 55점
- 답변이 30초 미만으로 짧은 경우: 최대 45점
- 질문 의도를 정확히 파악하지 못한 답변: relevance 최대 50점
- "없습니다", "잘 모르겠습니다" 등 답변 회피: 모든 항목 15점 이하

대기업 가점 기준:
- 정량적 성과(수치, 비율, 기간)를 포함한 답변: +5~10점
- 실패 경험에서 배운 점까지 언급: +5점
- 면접관의 의도를 넘어서는 깊이 있는 답변: +5~10점`
    : companySize === 'small'
      ? `[스타트업 모드] 실무 역량과 성장 가능성 중심으로 평가합니다.

점수 분포 가이드:
- 80~100: 우수한 답변 (구체적 사례 + 실무 감각 + 성장 의지)
- 60~79: 양호한 답변 (기본은 갖췄지만 보완 필요)
- 40~59: 부족한 답변 (핵심이 빠지거나 추상적)
- 20~39: 매우 부족 (내용이 거의 없거나 질문 이해 못함)
- 0~19: 답변 거부/회피

일반 원칙:
- 경험이 적어도 학습 의지와 성장 가능성이 보이면 가점
- 스타트업 특성상 다양한 역할 수행 경험을 높이 평가
- 면접 초보자가 대상이므로 격려 중심 피드백`
      : `[중소/중견 모드] 기본기와 팀 적합성 중심으로 평가합니다.

점수 분포 가이드:
- 80~100: 우수한 답변 (구체적 사례 + 논리적 구조 + 핵심 키워드)
- 60~79: 양호한 답변 (기본은 갖췄지만 보완 필요)
- 40~59: 부족한 답변 (핵심이 빠지거나 추상적)
- 20~39: 매우 부족 (내용이 거의 없거나 질문 이해 못함)
- 0~19: 답변 거부/회피

일반 원칙:
- 내용이 있고 질문에 맞게 답했으면 최소 50점 이상
- 경험을 말하려고 노력한 흔적이 보이면 가점
- 면접 초보자가 대상이라는 점을 고려하되, 개선점은 명확히 지적`
}

공통 감점 기준:
- 답변 거부/회피: 모든 항목 15점 이하, pass=false
- 질문과 완전히 무관한 답변: relevance 20점 이하

## 피드백 작성 원칙 (매우 중요)
- **질문별 comment**: 최소 4~5문장. 무엇을 잘했는지, 무엇이 부족한지, 어떻게 개선하면 좋은지를 구체적으로 작성.
- **overallComment**: 최소 5~6문장. 면접 전체를 관통하는 총평. 이 수강생의 면접 준비 수준, 강점 패턴, 반복되는 약점, 다음 연습에서 집중해야 할 것을 포함.
- **strengths/improvements**: 각 최소 3개. 추상적이지 않게, 실제 답변 내용을 인용하며 작성.
- 단편적인 한 줄 피드백 금지. 수강생이 읽고 실제로 개선할 수 있는 수준의 구체적 피드백을 작성하세요.
- 피드백에 "STAR", "STAR 기법", "STAR 구조" 등의 용어를 절대 사용하지 마세요. 내부 평가 기준일 뿐 수강생에게 노출하지 않습니다.

## 문제 구절 지적 (problemPhrases)
각 질문 피드백에서, 답변 원문 중 문제가 되는 구절을 정확히 인용하여 지적해주세요.
- "text": 답변 원문에서 그대로 복사한 문제 구절 (반드시 원문과 일치해야 함)
- "reason": 왜 문제인지 간단히
- "severity": "warning"(개선 필요) 또는 "error"(심각한 문제)
- 문제가 없으면 빈 배열 []

반드시 아래 JSON 형식으로만 응답하세요:
{
  "evaluators": [
${evaluatorConfig.jsonExample}
  ],
  "speechFeedback": {
    "fillerWordComment": "습관어 사용에 대한 코멘트",
    "silenceComment": "침묵 구간에 대한 코멘트",
    "paceComment": "답변 속도/시간에 대한 코멘트"
  },
  "sampleAnswers": [
    { "questionIndex": 0, "answer": "모범 답안 (2~3문장)" }
  ]
}`

  // 최대 3회 재시도 (간격 증가: 2초, 5초)
  const delays = [2000, 5000]
  let lastError = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      console.log(
        `[analyzeText] ${attempt + 1}차 시도 (답변 ${answers.length}개, 입력 ${answersText.length}자)`,
      )
      const content = await callOpenRouter({
        model: 'anthropic/claude-sonnet-4',
        maxTokens: 65536,
        timeoutMs: 480000, // 8분
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: answersText },
        ],
        jsonMode: true,
      })

      console.log(`[analyzeText] ${attempt + 1}차 응답 수신 (${content?.length || 0}자)`)
      const parsed = safeParseJSON(content, 'analyzeText')

      // 평가자 데이터 최소 검증 (evaluators 배열만 있으면 통과)
      if (!parsed.evaluators || parsed.evaluators.length === 0) {
        throw new Error('evaluators 데이터가 비어있습니다 (응답 잘림 가능성)')
      }

      return parsed
    } catch (e) {
      lastError = e
      console.warn(`[analyzeText] ${attempt + 1}차 시도 실패:`, e.message)
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, delays[attempt]))
      }
    }
  }
  throw lastError
}

/**
 * 비전 분석 - 비언어적 요소 평가
 */
export async function analyzeVision({ answers }) {
  const frameMessages = []
  answers.forEach((a, i) => {
    if (a.frames && a.frames.length > 0) {
      frameMessages.push({
        type: 'text',
        text: `[질문 ${i + 1}의 캡처 프레임 ${a.frames.length}장]`,
      })
      a.frames.forEach((frame) => {
        frameMessages.push({ type: 'image_url', image_url: { url: frame } })
      })
    }
  })

  if (frameMessages.length === 0) {
    return { visionFeedbacks: [], overallVisionScore: 0, tips: [] }
  }

  const systemPrompt = `당신은 면접 비언어적 커뮤니케이션 평가 전문가입니다.
면접자의 캡처 이미지를 분석하여 비언어적 요소를 엄격하게 평가해주세요.
각 질문에 대해 5초 간격으로 캡처한 여러 장의 프레임이 제공됩니다.

## 평가 기준 (각 0~100점)
- eyeContact: 카메라(면접관)를 응시하고 있는가? 시선이 다른 곳을 보고 있지 않은가?
- expression: 면접에 적절한 표정인가? 진지함, 자연스러운 미소, 자신감이 느껴지는가?
- posture: 바른 자세인가? 안정적으로 앉아있는가? 과도한 움직임은 없는가?

## 반드시 감지해야 할 문제 행동 (발견 시 해당 항목 20점 이하)
- 카메라를 보지 않고 다른 곳을 응시 (모니터, 아래, 옆 등)
- 음식 섭취, 음료 마시기
- 과도한 몸 흔들기, 의자 회전
- 손 흔들기, 부적절한 제스처
- 턱 괴기, 팔짱 끼기
- 하품, 기지개
- 스마트폰 사용
- 면접에 부적절한 복장이나 배경
- 무표정/무관심한 태도
- 대답 중 웃음이 과도하거나 부적절한 경우

## 채점 원칙
- 문제 행동이 1개 프레임이라도 발견되면 해당 항목 점수를 크게 감점
- 여러 프레임에서 반복되면 더 큰 감점
- 전반적으로 양호해도 관대하게 점수를 주지 마세요 (70점 이상은 "매우 좋다"의 의미)
- 문제가 발견된 프레임은 반드시 problemFrames에 기재

반드시 아래 JSON 형식으로만 응답하세요:
{
  "visionFeedbacks": [
    {
      "questionIndex": 0,
      "eyeContact": { "score": 0, "comment": "코멘트" },
      "expression": { "score": 0, "comment": "코멘트" },
      "posture": { "score": 0, "comment": "코멘트" },
      "problemFrames": [
        { "frameIndex": 0, "issue": "문제 설명 (예: 시선이 아래를 향함)", "category": "eyeContact" }
      ]
    }
  ],
  "overallVisionScore": 0,
  "tips": ["팁1", "팁2"]
}`

  const content = await callOpenRouter({
    model: 'openai/gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: '아래 면접 캡처 이미지들을 분석해주세요.' },
          ...frameMessages,
        ],
      },
    ],
    jsonMode: true,
  })

  return safeParseJSON(content, 'analyzeVision')
}
