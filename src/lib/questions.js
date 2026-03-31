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

// 트랙별 intro/lastq ID 매핑
const INTRO_IDS = ['beh-intro', 'unity-intro', 'unreal-intro', 'pm-intro', 'design-intro']
const LASTQ_IDS = ['beh-lastq', 'unity-lastq', 'unreal-lastq', 'pm-lastq', 'design-lastq']

/**
 * 트랙별 질문 풀에서 지정 수만큼 반환
 * 자기소개 = 항상 첫 번째
 * 마지막으로 하고 싶은 말 = 항상 마지막 (4문항 이상일 때)
 */
export function getQuestions(count = 4, track = 'behavioral') {
  const pool = TRACK_POOLS[track] || TRACK_POOLS.behavioral

  const intro = pool.find((q) => INTRO_IDS.includes(q.id))
  const lastq = pool.find((q) => LASTQ_IDS.includes(q.id))
  const rest = shuffle(pool.filter((q) => q !== intro && q !== lastq))

  if (count <= 3) {
    return intro ? [intro, ...rest.slice(0, count - 1)] : rest.slice(0, count)
  }

  // 4개 이상: 자기소개 + 랜덤 + 마무리
  const middleCount = count - (intro ? 1 : 0) - (lastq ? 1 : 0)
  const middle = rest.slice(0, Math.max(0, middleCount))

  const result = []
  if (intro) result.push(intro)
  result.push(...middle)
  if (lastq) result.push(lastq)

  return result.slice(0, count)
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
