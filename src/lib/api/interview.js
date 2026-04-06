/**
 * 면접 진행 관련 API - STT 교정, 꼬리질문 생성
 */
import { callOpenRouter, TRACK_TERMS, safeParseJSON } from './client'

/**
 * STT 텍스트 교정 - 음성 인식 오류를 문맥에 맞게 보정
 * Whisper base의 부정확한 한국어를 LLM이 교정
 */
export async function correctTranscript(rawTranscript, questionText, track = '') {
  if (!rawTranscript || rawTranscript.trim().length < 5) return rawTranscript || ''

  const content = await callOpenRouter({
    model: 'anthropic/claude-haiku-4-5-20251001',
    maxTokens: 8192,
    timeoutMs: 300000,
    messages: [
      {
        role: 'system',
        content: `당신은 한국어 음성 인식(STT) 교정 전문가입니다.
Whisper 모델이 한국어를 인식한 결과를 교정합니다. 이 텍스트는 취업 면접 답변입니다.

## 적극적으로 교정해야 할 것
1. **발음 유사 오인식**: STT가 발음이 비슷한 다른 단어로 잘못 인식한 것을 문맥에 맞게 교정
   - 예: "생물" → "신입", "월요소" → "어릴 때부터", "이력이" → "이런 게", "과차" → "과정"
   - 예: "해갖고" 가 "해 같고"로 인식된 경우 → "해갖고"로 복원
   - 예: 고유명사 오인식 "유니트" → "유니티", "언리얼" → "언리얼"(정상)
2. **단어 경계 오류**: 띄어쓰기가 잘못되어 의미가 달라진 것 교정
   - 예: "게임기 획" → "게임기획", "팀프로 젝트" → "팀 프로젝트"
3. **조사 오류**: STT가 잘못 붙이거나 누락한 조사 교정
   - 예: "게임을를" → "게임을", "저는은" → "저는"
4. **문장 부호**: 문장 끝에 마침표, 자연스러운 쉼표. 과도하지 않게.
5. **외래어/전문용어**: 면접 맥락에서 자주 쓰이는 용어가 잘못 인식된 경우 교정
   - 예: "C 샵" → "C#", "레이 캐스트" → "레이캐스트"
6. **면접/교육 도메인 특화 오인식** (Whisper가 자주 틀리는 실제 패턴):
   - 회사명: "팀스파타/팀스파라타/팀스프라타/팀 스파트" → "팀스파르타"
   - 교육: "커리클롬/커리킬로" → "커리큘럼", "수방생/수사생/수학생" → "수강생"
   - 직무: "기회 매니저/기획레니저" → "기획 매니저", "운영메이저" → "운영매니저"
   - 교육: "당기심/당기심의" → "부트캠프", "플로트" → "부트캠프", "채우시장" → "취업시장"
   - HR: "고객강원" → "고객관리", "체형 공고" → "채용 공고", "렌저업" → "면접"
   - 기타: "기종공사" → "비전공자", "중독폭" → "중도포기율", "이탈리" → "이탈률"
   - 장소: "공유업비스/공유피스" → "공유오피스"
   - 발음유사: "해외할" → "협업할", "이랄" → "일할", "동녀" → "동료"
   - 발음유사: "속통" → "소통", "계단하고" → "깨달았고", "홍당" → "성장"
   - 교육: "교육군형" → "교육운영", "단영간" → "다년간", "내배운 캠프/내일병 캠프" → "내일배움캠프/부트캠프"
   - 직무: "입하실" → "임하실", "명령" → "경력/경험", "발탄" → "바탕"
   - 발음유사: "다녀는" → "원활한", "언급을 찾을" → "문제가", "일정맵만" → "일정에 맞춰서"
   - 발음유사: "배타적인 퇴도" → "겸손한 태도", "면적/렌접" → "면접", "인제" → "인재", "그위욕은형" → "교육운영"
   - 게임업계: "플래스토어" → "플레이스토어", "액스토어" → "앱스토어", "엠매직" → "앱매직"
   - 게임업계: "하이퍼케주얼" → "하이퍼캐주얼", "인디조각" → "인디게임", "낀지라이크" → "쿠키런라이크"
   - 게임기획: "제어시스템" (경제 맥락) → "재화 시스템/경제 시스템", "플레이션" → "인플레이션"
   - 게임기획: "브이로시" → "피드백", "바보자끼위해" → "해결하기 위해"
   - 발음유사: "도와지" → "도화지", "섣반" → "석권/차지", "흥냉/흥냥" → "인기"
   - 게임개발: "얼려얼/연렐렌즈" → "언리얼", "스프블리키초" → "스프라이트키트"
   - 게임개발: "탈력감" → "타격감", "입펇/입퇴" → "이펙트", "자도치" → "작업"
7. **문맥 흐름 교정**: 단어는 맞지만 조사가 어긋나서 문장이 안 읽히는 경우 자연스럽게 조사 수정
   - 예: "수강생들의 어려움을 겪으면서" → "수강생들이 어려움을 겪어서"
   - 예: "이해할 수 있는 자연으로" → "이해할 수 있는 수준으로"

${track && TRACK_TERMS[track] ? `8. **${track.toUpperCase()} 트랙 전문용어 교정 (이 트랙 면접이므로 반드시 적용)**:${TRACK_TERMS[track]}` : ''}

## 절대 하지 말 것
- 발화자가 실제로 한 말의 의미를 바꾸거나 보충하지 마세요
- 축약 표현 유지 ("그래갖고", "해갖고", "근데" 등 구어체 그대로)
- 말이 꼬이거나 반복한 부분 유지 (면접 평가 대상)
- 습관어(음, 어, 그, 아) 유지
- 문장을 합치거나 분리하지 마세요
- 말투/어조를 바꾸지 마세요

## 반복 환각 제거 (매우 중요)
- STT 모델이 같은 문장/구절을 여러 번 반복 출력하는 경우가 있음
- 동일하거나 거의 동일한 문장이 2회 이상 연속 반복되면 1회만 남기고 제거
- 예: "공동의 목표는 프로젝트에서 공동의 목표는 프로젝트에서 공동의 목표는..." → "공동의 목표는 프로젝트에서"

## 판단 기준
- 해당 단어가 면접 답변 문맥에서 말이 되는가?
- 말이 안 되면 발음이 유사한 다른 단어가 있는가?
- 확신이 없으면 원본 유지 (잘못된 교정보다 오인식 유지가 나음)

교정된 텍스트만 출력하세요.`,
      },
      {
        role: 'user',
        content: `[면접 질문] ${questionText}\n\n[음성 인식 결과 (교정 필요)]\n${rawTranscript}`,
      },
    ],
  })

  const corrected = content?.trim() || rawTranscript

  // STT 교정 전후 비교 로그
  console.log(`[STT 교정] 원문(${rawTranscript.length}자): ${rawTranscript.slice(0, 80)}${rawTranscript.length > 80 ? '...' : ''}`)
  console.log(`[STT 교정] 교정(${corrected.length}자): ${corrected.slice(0, 80)}${corrected.length > 80 ? '...' : ''}`)

  // 환각 방어 1: 원본이 30자 미만인데 교정 결과가 3배 이상 길면 LLM이 답변을 만들어낸 것
  if (rawTranscript.length < 30 && corrected.length > rawTranscript.length * 3 + 20) {
    console.warn('[교정] 환각 의심 - 원본 유지:', rawTranscript.length, '→', corrected.length)
    return rawTranscript
  }

  // 환각 방어 2: 원본이 Whisper 전형적 환각이면 빈 문자열 반환
  const hallucinationCheck =
    /^\s*(MBC|KBS|SBS|JTBC|YTN)\s*뉴스|뉴스.{0,5}입니다|^\s*안녕하세요[,.]?\s*.{1,5}입니다\.?$|^\s*.{1,5}입니다\.?$/
  if (hallucinationCheck.test(rawTranscript.trim()) || rawTranscript.trim().length < 15) {
    console.warn('[교정] Whisper 환각 감지 - 빈 답변 처리:', rawTranscript)
    return ''
  }

  return corrected
}

/**
 * 꼬리질문 생성 - 답변이 부족할 때만
 */
export async function generateFollowUp(
  questionText,
  roughTranscript,
  evaluatorNames = [],
  questionId = '',
  recordingDuration = 0,
) {
  // 자기소개, 마무리 질문은 꼬리질문 스킵
  if (questionId === 'beh-intro' || questionId === 'beh-lastq') {
    return { needed: false }
  }

  const hasTranscript = roughTranscript && roughTranscript.trim().length >= 5

  // 30초 이상 답변했으면 꼬리질문 불필요 (충분히 답변함)
  if (recordingDuration >= 30) {
    return { needed: false }
  }

  // 15초 미만 + 답변 내용 없음 → 회피성 답변으로 판단 → 꼬리질문 생성
  if (recordingDuration < 15 && !hasTranscript) {
    const asker = evaluatorNames[0]
    return {
      needed: true,
      question:
        '답변이 짧았는데, 비슷한 상황을 경험하지 못했더라도 어떻게 접근하실지 말씀해주시겠어요?',
      evaluatorId: asker?.id || 'hr',
    }
  }

  // Web Speech 텍스트가 없으면 판단 불가 → 스킵
  if (!hasTranscript) {
    return { needed: false }
  }

  const nameList = evaluatorNames
    .map((e) => `- ${e.id}: ${e.name} (${e.role}, ${e.style})`)
    .join('\n')

  const content = await callOpenRouter({
    model: 'anthropic/claude-sonnet-4',
    messages: [
      {
        role: 'system',
        content: `당신은 면접 패널의 일원입니다. 지원자의 답변을 듣고, 꼬리질문이 필요한지 판단합니다.

## 면접관 패널
${nameList}

## 꼬리질문 판단 기준

대부분의 답변에는 꼬리질문이 불필요합니다. 10개 중 2~3개 정도만 꼬리질문이 필요합니다.

꼬리질문이 필요한 경우 (매우 제한적):
- "없습니다" 등 회피 답변 → "비슷한 상황이라면 어떻게 하시겠어요?"
- 경험을 말했지만 본인 역할이 전혀 언급되지 않은 경우에만 → "그 과정에서 본인이 직접 한 행동은?"
- 결과나 교훈이 완전히 빠진 경우에만 → "그래서 결과는 어땠나요?"

꼬리질문이 불필요한 경우 (대부분 여기에 해당):
- 30초 이상 답변한 경우 → 거의 항상 스킵
- 사례를 하나라도 언급한 경우 → 스킵
- 조금 부족하더라도 평가 리포트에서 충분히 지적 가능 → 스킵
- 답변이 완벽하지 않아도 기본적인 내용이 있으면 → 스킵

## 금지되는 꼬리질문 (이런 질문은 절대 생성하지 마세요)
- "좀 더 구체적으로 말씀해주시겠어요?"
- "조금 더 자세히 설명해주시겠어요?"
- "예시를 들어주시겠어요?"
- "더 말씀해주실 것이 있나요?"
- 위와 비슷한 포괄적/범용적 질문 전부 금지

꼬리질문은 반드시 답변 내용에서 특정 키워드나 사건을 인용하며 질문해야 합니다.
예: "아까 '프론트엔드 작업이 지연됐다'고 하셨는데, 그때 백엔드 팀과 어떻게 일정을 조율하셨나요?"

반드시 JSON으로만 응답:
{ "needed": true, "question": "꼬리질문", "evaluatorId": "질문하는 면접관 id", "reason": "판단 이유" }
또는
{ "needed": false }`,
      },
      {
        role: 'user',
        content: `[메인 질문] ${questionText}\n[답변 (음성 인식 결과, 부정확할 수 있음)] ${roughTranscript}`,
      },
    ],
    jsonMode: true,
  })

  return safeParseJSON(content, 'generateFollowUp')
}
