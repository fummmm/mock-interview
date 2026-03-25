import commonQuestions from '../data/questions/common.json'
import behavioralQuestions from '../data/questions/behavioral.json'

/**
 * 트랙별 질문 풀에서 지정 수만큼 반환
 * 자기소개 = 항상 첫 번째
 * 마지막으로 하고 싶은 말 = 항상 마지막 (3문항 이상일 때)
 */
export function getQuestions(count = 4, track = 'behavioral') {
  const pool = track === 'behavioral'
    ? behavioralQuestions.questions
    : commonQuestions.questions

  const intro = pool.find((q) => q.id === 'beh-intro')
  const lastq = pool.find((q) => q.id === 'beh-lastq')
  const rest = shuffle(pool.filter((q) => q !== intro && q !== lastq))

  if (count <= 2) {
    // 2개 이하: 자기소개 + 랜덤 (마무리 생략)
    return intro ? [intro, ...rest.slice(0, count - 1)] : rest.slice(0, count)
  }

  // 3개 이상: 자기소개 + 랜덤 + 마무리
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
