/**
 * OpenRouter API 호출 헬퍼
 *
 * 개발: 클라이언트에서 직접 OpenRouter 호출 (VITE_ 환경변수)
 * 배포: Vercel Serverless Function 프록시로 전환 가능
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

function getApiKey() {
  const key = import.meta.env.VITE_OPENROUTER_API_KEY
  if (!key) console.warn('VITE_OPENROUTER_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.')
  return key
}

async function callOpenRouter({ model, messages, jsonMode = false }) {
  const body = { model, messages }
  if (jsonMode) body.response_format = { type: 'json_object' }

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'AI Mock Interview',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`OpenRouter API error (${res.status}): ${error}`)
  }

  const data = await res.json()
  return data.choices[0].message.content
}

/**
 * 텍스트 분석 - 3명 평가자 (실무 전문가 2 + 인사 담당자 1)
 */
export async function analyzeText({ questions, answers, track }) {
  const answersText = answers
    .map((a, i) => `[질문 ${i + 1}] ${a.questionText}\n[답변] ${a.transcript || '(답변 없음)'}\n[녹화 시간] ${a.recordingDuration}초\n[습관어(음,어 등)] ${a.fillerWordCount}회\n[침묵 구간] ${a.silenceSegments.length}회`)
    .join('\n\n---\n\n')

  const trackLabel = getTrackLabel(track)

  const systemPrompt = `당신은 게임 업계 면접 평가 시스템입니다.
아래 면접 답변에 대해 3명의 면접관이 각각 독립적으로 평가합니다.

## 면접관 구성
1. **실무 전문가 A** (${trackLabel} 시니어 개발자/기획자, 경력 7년+)
   - 기술적 정확성, 실무 적용 가능성, 문제 해결 역량 위주 평가
   - 솔직하고 직설적인 피드백 스타일

2. **실무 전문가 B** (${trackLabel} 리드급, 경력 10년+)
   - 설계 사고, 커뮤니케이션 능력, 성장 가능성 위주 평가
   - 건설적이고 구체적인 피드백 스타일

3. **인사 담당자** (게임회사 HR, 경력 5년+)
   - 조직 적합성, 태도, 자기 표현력, 협업 역량 위주 평가
   - 따뜻하지만 핵심을 짚는 피드백 스타일

## 평가 기준 (각 0~100점)
- relevance: 질문 의도 파악 및 답변 적합성
- structure: 체계적 답변 구조 (STAR 기법 등)
- keywords: 기술 용어 및 핵심 키워드 활용
- specificity: 구체적 사례/수치 제시

## 문제 구절 지적 (problemPhrases)
각 질문 피드백에서, 답변 원문 중 문제가 되는 구절을 정확히 인용하여 지적해주세요.
- "text": 답변 원문에서 그대로 복사한 문제 구절 (반드시 원문과 일치해야 함)
- "reason": 왜 문제인지 간단히
- "severity": "warning"(개선 필요) 또는 "error"(심각한 문제)
- 문제가 없으면 빈 배열 []

반드시 아래 JSON 형식으로만 응답하세요:
{
  "evaluators": [
    {
      "id": "expert_a",
      "name": "실무 전문가 A",
      "role": "${trackLabel} 시니어",
      "questionFeedbacks": [
        {
          "questionIndex": 0,
          "scores": { "relevance": 0, "structure": 0, "keywords": 0, "specificity": 0 },
          "comment": "이 질문에 대한 종합 코멘트 (2~3문장)",
          "problemPhrases": [
            { "text": "답변에서 문제가 된 정확한 구절 (원문 그대로)", "reason": "왜 문제인지 한 줄 설명", "severity": "warning" },
            { "text": "더 심각한 문제 구절", "reason": "이유", "severity": "error" }
          ]
        }
      ],
      "overallComment": "면접 전체에 대한 총평 (3~4문장)",
      "strengths": ["강점1", "강점2"],
      "improvements": ["개선점1", "개선점2"],
      "pass": true
    },
    {
      "id": "expert_b",
      "name": "실무 전문가 B",
      "role": "${trackLabel} 리드",
      "questionFeedbacks": [
        {
          "questionIndex": 0,
          "scores": { "relevance": 0, "structure": 0, "keywords": 0, "specificity": 0 },
          "comment": "이 질문에 대한 종합 코멘트 (2~3문장)",
          "problemPhrases": [
            { "text": "문제 구절", "reason": "이유", "severity": "warning" }
          ]
        }
      ],
      "overallComment": "면접 전체에 대한 총평 (3~4문장)",
      "strengths": ["강점1", "강점2"],
      "improvements": ["개선점1", "개선점2"],
      "pass": true
    },
    {
      "id": "hr",
      "name": "인사 담당자",
      "role": "게임회사 HR",
      "questionFeedbacks": [
        {
          "questionIndex": 0,
          "scores": { "relevance": 0, "structure": 0, "keywords": 0, "specificity": 0 },
          "comment": "이 질문에 대한 종합 코멘트 (2~3문장)",
          "problemPhrases": [
            { "text": "문제 구절", "reason": "이유", "severity": "warning" }
          ]
        }
      ],
      "overallComment": "면접 전체에 대한 총평 (3~4문장)",
      "strengths": ["강점1", "강점2"],
      "improvements": ["개선점1", "개선점2"],
      "pass": true
    }
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

  const content = await callOpenRouter({
    model: 'anthropic/claude-3.5-haiku',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: answersText },
    ],
    jsonMode: true,
  })

  return JSON.parse(content)
}

/**
 * 비전 분석 - 비언어적 요소 평가
 */
export async function analyzeVision({ answers }) {
  const frameMessages = []
  answers.forEach((a, i) => {
    if (a.frames && a.frames.length > 0) {
      frameMessages.push({ type: 'text', text: `[질문 ${i + 1}의 캡처 프레임 ${a.frames.length}장]` })
      a.frames.forEach((frame) => {
        frameMessages.push({ type: 'image_url', image_url: { url: frame } })
      })
    }
  })

  if (frameMessages.length === 0) {
    return { visionFeedbacks: [], overallVisionScore: 0, tips: [] }
  }

  const systemPrompt = `당신은 면접 비언어적 커뮤니케이션 평가 전문가입니다.
면접자의 캡처 이미지를 분석하여 비언어적 요소를 평가해주세요.
각 질문에 대해 여러 장의 프레임이 제공됩니다 (시작/중간/끝 시점 캡처).

평가 기준:
- eyeContact: 카메라(면접관) 응시 여부 (0~100)
- expression: 표정의 자연스러움과 자신감 (0~100)
- posture: 자세의 바름과 안정감 (0~100)

문제가 발견된 프레임이 있다면 problemFrames에 몇 번째 프레임(0부터)인지와 이유를 기재해주세요.

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
    model: 'openai/gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: [
        { type: 'text', text: '아래 면접 캡처 이미지들을 분석해주세요.' },
        ...frameMessages,
      ]},
    ],
    jsonMode: true,
  })

  return JSON.parse(content)
}

function getTrackLabel(track) {
  const labels = { unity: 'Unity 개발', unreal: 'Unreal Engine 개발', design: '게임기획' }
  return labels[track] || '게임 개발'
}
