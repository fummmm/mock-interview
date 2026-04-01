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
export function getQuestions(count = 4, track = 'behavioral') {
  const pool = TRACK_POOLS[track] || TRACK_POOLS.behavioral

  const intro = pool.find((q) => INTRO_IDS.includes(q.id))
  const rest = shuffle(pool.filter((q) => q !== intro))

  if (intro) {
    return [intro, ...rest.slice(0, count - 1)]
  }
  return rest.slice(0, count)
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
