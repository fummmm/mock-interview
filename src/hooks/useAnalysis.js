import { useState, useCallback } from 'react'
import { analyzeText, analyzeVision } from '../lib/api'

export function useAnalysis() {
  const [report, setReport] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)

  const analyze = useCallback(async ({ questions, answers, track }) => {
    setIsAnalyzing(true)
    setProgress(0)
    setError(null)

    try {
      setProgress(10)

      const [textResult, visionResult] = await Promise.allSettled([
        analyzeText({ questions, answers, track }).then((r) => { setProgress(50); return r }),
        analyzeVision({ answers }).then((r) => { setProgress(80); return r }),
      ])

      setProgress(90)

      const textData = textResult.status === 'fulfilled' ? textResult.value : null
      const visionData = visionResult.status === 'fulfilled' ? visionResult.value : null

      if (!textData && !visionData) {
        throw new Error('텍스트 분석과 비전 분석 모두 실패했습니다.')
      }

      const combinedReport = buildReport(textData, visionData, answers)
      setProgress(100)
      setReport(combinedReport)
      return combinedReport
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setIsAnalyzing(false)
    }
  }, [])

  return { report, isAnalyzing, progress, error, analyze }
}

export function buildReport(textData, visionData, answers, companySize = 'medium') {
  const questionCount = answers.length
  const evaluators = textData?.evaluators || []

  // 3명 평가자별 평균 점수 계산
  const evaluatorReports = evaluators.map((ev) => {
    const questionScores = ev.questionFeedbacks.map((fb) => {
      const s = fb.scores
      return Math.round((s.relevance + s.structure + s.keywords + s.specificity) / 4)
    })
    const avgScore = questionScores.length > 0
      ? Math.round(questionScores.reduce((a, b) => a + b, 0) / questionScores.length)
      : 0

    return {
      ...ev,
      avgScore,
      grade: avgScore >= 90 ? 'S' : avgScore >= 80 ? 'A' : avgScore >= 70 ? 'B' : avgScore >= 60 ? 'C' : 'D',
    }
  })

  // 전체 종합 점수 (3명 평균)
  const allAvgScores = evaluatorReports.map((e) => e.avgScore).filter((s) => s > 0)
  const overallScore = allAvgScores.length > 0
    ? Math.round(allAvgScores.reduce((a, b) => a + b, 0) / allAvgScores.length)
    : 0

  // 비전 데이터 매핑
  const visionByQuestion = {}
  if (visionData?.visionFeedbacks) {
    visionData.visionFeedbacks.forEach((vf) => { visionByQuestion[vf.questionIndex] = vf })
  }

  // 질문별 데이터 (영상 + 프레임 + 전사 텍스트 + 모범 답안 + 문제 구절)
  const questionData = answers.map((a, i) => {
    // 3명 평가자의 problemPhrases를 합산 (중복 제거)
    const allProblemPhrases = []
    const seenTexts = new Set()
    evaluators.forEach((ev) => {
      const fb = ev.questionFeedbacks?.find((f) => f.questionIndex === i)
      if (fb?.problemPhrases) {
        fb.problemPhrases.forEach((pp) => {
          if (pp.text && !seenTexts.has(pp.text)) {
            seenTexts.add(pp.text)
            allProblemPhrases.push({ ...pp, evaluator: ev.name })
          }
        })
      }
    })

    return {
      questionIndex: i,
      questionText: a.questionText,
      transcript: a.transcript,
      rawTranscript: a.rawTranscript || '',
      videoBlobUrl: a.videoBlobUrl,
      recordingDuration: a.recordingDuration,
      frames: a.frames || [],
      vision: visionByQuestion[i] || null,
      sampleAnswer: textData?.sampleAnswers?.find((s) => s.questionIndex === i)?.answer || '',
      problemPhrases: allProblemPhrases,
      followUp: a.followUp || null,
    }
  })

  // 카테고리별 점수 (3명 평균)
  const categoryScores = { relevance: 0, structure: 0, keywords: 0, specificity: 0 }
  let totalEvaluatorQuestions = 0
  evaluators.forEach((ev) => {
    ev.questionFeedbacks.forEach((fb) => {
      categoryScores.relevance += fb.scores.relevance
      categoryScores.structure += fb.scores.structure
      categoryScores.keywords += fb.scores.keywords
      categoryScores.specificity += fb.scores.specificity
      totalEvaluatorQuestions++
    })
  })
  if (totalEvaluatorQuestions > 0) {
    categoryScores.relevance = Math.round(categoryScores.relevance / totalEvaluatorQuestions)
    categoryScores.structure = Math.round(categoryScores.structure / totalEvaluatorQuestions)
    categoryScores.keywords = Math.round(categoryScores.keywords / totalEvaluatorQuestions)
    categoryScores.specificity = Math.round(categoryScores.specificity / totalEvaluatorQuestions)
  }
  categoryScores.nonverbal = visionData?.overallVisionScore || 0

  const grade = overallScore >= 90 ? 'S' : overallScore >= 80 ? 'A' : overallScore >= 70 ? 'B' : overallScore >= 60 ? 'C' : 'D'

  // 합격 여부: 기업 규모별 판정 로직
  const passThreshold = companySize === 'large' ? 70 : 60
  const evaluatorReportsWithPass = evaluatorReports.map((e) => ({
    ...e,
    pass: e.avgScore >= passThreshold,
  }))
  const passCount = evaluatorReportsWithPass.filter((e) => e.pass).length
  const totalEvaluators = evaluatorReportsWithPass.length

  let overallPass = false
  if (companySize === 'small') {
    // 스타트업 (2명): 과반 합격 (2/2) AND 평균 60+
    overallPass = passCount >= Math.ceil(totalEvaluators / 2) && overallScore >= 60
  } else if (companySize === 'large') {
    // 대기업 (4명): 과반 합격 (3/4) AND 평균 70+
    overallPass = passCount >= Math.ceil(totalEvaluators * 0.75) && overallScore >= 70
  } else {
    // 중소/중견 (3명): 과반 합격 (2/3) AND 평균 60+
    overallPass = passCount >= Math.ceil(totalEvaluators / 2) && overallScore >= 60
  }

  return {
    overallScore,
    grade,
    overallPass,
    passCount,
    questionCount,
    categoryScores,
    evaluators: evaluatorReportsWithPass,
    questionData,
    speechFeedback: textData?.speechFeedback || null,
    visionTips: visionData?.tips || [],
  }
}
