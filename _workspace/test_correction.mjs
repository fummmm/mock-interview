/**
 * Haiku vs Sonnet STT 교정 품질 비교 테스트
 * 실행: node _workspace/test_correction.mjs
 */
import { readFileSync } from 'fs'
const envText = readFileSync('.env', 'utf-8')
const match = envText.match(/VITE_OPENROUTER_API_KEY=(.+)/)
const API_KEY = match?.[1]?.trim()
if (!API_KEY) { console.error('VITE_OPENROUTER_API_KEY not found in .env'); process.exit(1) }

const SYSTEM_PROMPT = `당신은 한국어 음성 인식(STT) 교정 전문가입니다.
Whisper 모델이 한국어를 인식한 결과를 교정합니다. 이 텍스트는 취업 면접 답변입니다.

## 적극적으로 교정해야 할 것
1. **발음 유사 오인식**: STT가 발음이 비슷한 다른 단어로 잘못 인식한 것을 문맥에 맞게 교정
2. **단어 경계 오류**: 띄어쓰기가 잘못되어 의미가 달라진 것 교정
3. **조사 오류**: STT가 잘못 붙이거나 누락한 조사 교정
4. **문장 부호**: 문장 끝에 마침표, 자연스러운 쉼표
5. **외래어/전문용어**: 면접 맥락에서 자주 쓰이는 용어 교정
6. **면접/교육 도메인 특화 오인식**:
   - 회사명: "팀스파타/팀스파라타/팀스프라타" → "팀스파르타"
   - 교육: "커리클롬/커리킬로" → "커리큘럼", "수방생/수사생" → "수강생"
   - 직무: "기회 매니저" → "기획 매니저", "교육군형" → "교육운영"
   - 발음유사: "단영간" → "다년간", "발탄" → "바탕", "인제" → "인재"
7. **문맥 흐름 교정**: 조사가 어긋나서 문장이 안 읽히는 경우

## 절대 하지 말 것
- 발화자가 실제로 한 말의 의미를 바꾸거나 보충하지 마세요
- 축약 표현 유지 ("그래갖고", "해갖고" 등 구어체 그대로)
- 말이 꼬이거나 반복한 부분 유지 (면접 평가 대상)
- 습관어(음, 어, 그, 아) 유지

교정된 텍스트만 출력하세요.`

// 테스트 케이스: 실제 STT 원문 3개 (오인식이 많은 것들)
const TEST_CASES = [
  {
    label: 'Case 1: 자기소개 (오인식 많음)',
    question: '본인의 경력과 핵심 역량을 중심으로 자기소개를 해주세요.',
    raw: '안녕하세요 저는 이번 팀 스파레터 커리클럽개 매니저 직원한 한유승입니다. 저는 3년간의 교육 운영 경험과 1년간의 호텔 경험을 가지고 있습니다. 이 둘은 상관된 경력처럼 볼 수도 있지만 저는 고객의 목소리의 기위의 기위의 규이고 서비스의 관리한다는 측면에서 이 두 경력을 하나의 경험으로 묶었습니다.',
  },
  {
    label: 'Case 2: 협업 경험 (발음유사 오인식)',
    question: '협업할 때 본인이 가장 중요하게 생각하는 것은 무엇인가요?',
    raw: '저는 협업할 때 가장 중요하게 생각하는 것은 다녀는 소통입니다. 어떤 직무든 간에 이해 관계자와의 협업은 반드시 필수이라고 생각을 하는데요. 그 관계 속에서 원활한 소통이 이뤄지지 않는다면 언급을 찾을 생길 뿐더러 정해진 일정맵만 쳐서 그 업무를 진행할 수 없을 것이라고 생각합니다.',
  },
  {
    label: 'Case 3: 성취감 (복합 오인식)',
    question: '지금까지의 경험 중 가장 성취감을 느꼈던 순간은 언제인가요?',
    raw: '제가 가장 성시감을 느꼈던 순간은 제가 교육은 형 매니저로서 일을 하면서 처음으로 맡았던 기수의 수료생분이 수조 이후에 저한테 따로 감사의 장문 뒤에 디렉트 메시지를 보냈던 순간입니다. 저는 사실 그 전에는 호텔에서 일을 했다고 말씀을 드린 것과 같이 교육 도매인에서 정통하지 않았고 교육 도매인은 오래 몸딴고 있지 않았기 때문에 교육에서 오는 이런 성식함이나 교육에서 오는 뿌듯한 전혀 모르고 있는 상태였습니다.',
  },
]

const MODELS = [
  { id: 'anthropic/claude-haiku-4-5', label: 'Haiku 4.5' },
  { id: 'anthropic/claude-sonnet-4', label: 'Sonnet 4' },
]

async function callAPI(model, question, raw) {
  const start = Date.now()
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `[면접 질문] ${question}\n\n[음성 인식 결과 (교정 필요)]\n${raw}` },
      ],
    }),
  })
  const data = await res.json()
  const elapsed = Date.now() - start
  const text = data.choices?.[0]?.message?.content
  if (!text) console.log(`  [DEBUG ${model}]`, JSON.stringify(data).slice(0, 300))
  return { text: text || '(실패)', elapsed }
}

async function main() {
  console.log('=' .repeat(80))
  console.log('Haiku vs Sonnet STT 교정 품질 비교')
  console.log('='.repeat(80))

  for (const tc of TEST_CASES) {
    console.log(`\n${'─'.repeat(80)}`)
    console.log(`📌 ${tc.label}`)
    console.log(`질문: ${tc.question}`)
    console.log(`\n원문: ${tc.raw}`)

    const results = await Promise.all(
      MODELS.map(m => callAPI(m.id, tc.question, tc.raw).then(r => ({ ...r, label: m.label })))
    )

    for (const r of results) {
      console.log(`\n[${r.label}] (${(r.elapsed/1000).toFixed(1)}초)`)
      console.log(r.text)
    }
  }

  console.log(`\n${'='.repeat(80)}`)
  console.log('비교 완료')
}

main().catch(console.error)
