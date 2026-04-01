import behavioralQuestions from '../data/questions/behavioral.json'
import unityQuestions from '../data/questions/unity.json'
import unrealQuestions from '../data/questions/unreal.json'
import pmQuestions from '../data/questions/pm.json'
import designQuestions from '../data/questions/design.json'

const TRACK_POOLS = {
  behavioral: behavioralQuestions.questions,
  unity: unityQuestions.questions,
  unreal: unrealQuestions.questions,
  pm: pmQuestions.questions,
  design: designQuestions.questions,
}

const INTRO_IDS = ['beh-intro', 'unity-intro', 'unreal-intro', 'pm-intro', 'design-intro']

/**
 * 트랙별 질문 풀에서 지정 수만큼 반환
 * 자기소개 = 항상 첫 번째, 나머지는 랜덤
 */
export function getQuestions(count = 4, track = 'behavioral', companySize = 'medium') {
  const pool = TRACK_POOLS[track] || TRACK_POOLS.behavioral

  const intro = pool.find((q) => INTRO_IDS.includes(q.id))
  const rest = shuffle(pool.filter((q) => q !== intro))

  let result = intro ? [intro, ...rest.slice(0, count - 1)] : rest.slice(0, count)

  // 대기업: largeText 보유 질문 중 일부만 적용 (최소 2개 보장)
  if (companySize === 'large') {
    const largeEligible = result.map((q, i) => q.largeText ? i : -1).filter((i) => i >= 0)
    const largeCount = Math.max(2, Math.ceil(largeEligible.length * 0.5))
    const selected = new Set(shuffle(largeEligible).slice(0, largeCount))
    result = result.map((q, i) => selected.has(i) ? { ...q, text: q.largeText } : q)
  }

  return result
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
