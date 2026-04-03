# Mock Interview Harness — AI 모의면접 개발 하네스

AI 모의면접 플랫폼의 기능 추가, AI 개선, 버그 수정을 에이전트 팀이 협업하여 수행하는 도메인 특화 하네스.

## 구조

```
.claude/
├── agents/
│   ├── interview-designer.md    — 면접 시나리오/플로우 설계
│   ├── ai-engineer.md           — AI 프롬프트, 분석 파이프라인
│   ├── frontend-dev.md          — React UI, 미디어, 상태관리
│   ├── backend-dev.md           — Supabase, API, 데이터
│   ├── qa-engineer.md           — 테스트, 품질 검증
│   └── code-reviewer.md         — 코드 품질, 보안, 성능 리뷰
├── skills/
│   ├── mock-interview/
│   │   └── SKILL.md             — 오케스트레이터 (팀 조율, 워크플로우)
│   ├── interview-flow-design/
│   │   └── SKILL.md             — 면접 플로우 설계 패턴
│   ├── ai-prompt-engineering/
│   │   └── SKILL.md             — AI 프롬프트 엔지니어링 가이드
│   ├── supabase-operations/
│   │   └── SKILL.md             — Supabase 운영 가이드
│   ├── refactoring/
│   │   └── SKILL.md             — 리팩토링 워크플로우/패턴 카탈로그
│   ├── code-review/
│   │   └── SKILL.md             — 코드 리뷰 기준/체크리스트
│   └── conventional-commit/
│       └── SKILL.md             — Conventional Commits 커밋 분리/메시지 가이드
└── CLAUDE.md                    — 이 파일
```

## 기술 스택

- **프론트엔드**: React 19 + Vite + Tailwind CSS 4 + Zustand 5 + React Router 7
- **백엔드**: Supabase (PostgreSQL, RLS, Auth, Storage) + Vercel Serverless
- **AI**: OpenRouter API + Whisper.js (STT) + Tesseract.js (OCR)
- **미디어**: react-webcam + Web Audio API + MediaRecorder

## 사용법

`/mock-interview` 스킬을 트리거하거나, "기능 추가해줘", "버그 수정해줘" 같은 자연어로 요청한다.

## 에이전트별 확장 스킬

| 스킬 | 대상 에이전트 | 역할 |
|------|-------------|------|
| `interview-flow-design` | interview-designer | 면접 플로우/질문 전략/평가 루브릭 패턴 |
| `ai-prompt-engineering` | ai-engineer | OpenRouter API/프롬프트 설계/파싱 패턴 |
| `supabase-operations` | backend-dev | 스키마/RLS/쿼타/스토리지 운영 패턴 |
| `refactoring` | 전체 공유 | 안전한 리팩토링 워크플로우/패턴 카탈로그 |
| `code-review` | code-reviewer | 코드 품질/보안/성능 리뷰 기준 |
| `conventional-commit` | 전체 공유 | Conventional Commits 기반 커밋 분리/메시지 생성 |

## 산출물

- `_workspace/` — 설계 문서, 검증 보고서
- `src/` — 소스 코드 (React 프론트엔드)
- `api/` — Vercel 서버리스 함수
- `supabase/` — DB 스키마, RLS 정책
