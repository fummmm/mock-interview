/**
 * API 모듈 통합 re-export
 * 기존 import { ... } from '../lib/api' 경로 호환을 위한 barrel 파일
 */
export { correctTranscript, generateFollowUp } from './interview'
export { generateDocumentQuestions, generateJobPostingQuestions } from './questions'
export { analyzeText, analyzeVision } from './analysis'
