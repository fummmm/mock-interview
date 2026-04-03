---
name: mock-interview
description: "AI 모의면접 플랫폼 개발 오케스트레이터. 면접 기능 추가, AI 분석 개선, 버그 수정, 플로우 변경 등 모든 개발 작업을 에이전트 팀이 협업하여 수행한다. '기능 추가', '면접 개선', '버그 수정', '프롬프트 튜닝', '새 면접 유형', '질문 로직 변경', '분석 품질 개선', '면접 앱 개발', '모의면접' 등 이 프로젝트의 개발 작업 전반에 이 스킬을 사용한다. 단, 하네스 자체의 재구성이나 에이전트 정의 수정은 이 스킬의 범위가 아니다."
---

# Mock Interview — AI 모의면접 개발 오케스트레이터

면접 기능 추가, AI 분석 개선, 버그 수정 등 모의면접 플랫폼의 모든 개발 작업을 에이전트 팀이 협업하여 수행한다.

## 실행 모드

**에이전트 팀** — 5명이 SendMessage로 직접 통신하며 교차 검증한다.

## 에이전트 구성

| 에이전트 | 파일 | 역할 | 타입 |
|---------|------|------|------|
| interview-designer | `.claude/agents/interview-designer.md` | 면접 시나리오/플로우 설계 | general-purpose |
| ai-engineer | `.claude/agents/ai-engineer.md` | LLM 프롬프트, 분석 파이프라인 | general-purpose |
| frontend-dev | `.claude/agents/frontend-dev.md` | React UI, 미디어, 상태관리 | general-purpose |
| backend-dev | `.claude/agents/backend-dev.md` | Supabase, API, 데이터 | general-purpose |
| qa-engineer | `.claude/agents/qa-engineer.md` | 테스트, 품질 검증 | general-purpose |
| code-reviewer | `.claude/agents/code-reviewer.md` | 코드 품질, 보안, 성능 리뷰 | general-purpose |

모든 에이전트는 `model: "opus"` 파라미터를 명시하여 호출한다.

## 워크플로우

### Phase 1: 분석 (오케스트레이터 직접 수행)

1. 사용자 요청에서 추출한다:
   - **작업 유형**: 기능 추가 / AI 개선 / 버그 수정 / 리팩토링
   - **영향 범위**: 면접 플로우 / AI 파이프라인 / UI / 데이터 / 전체
   - **관련 파일**: 기존 코드 분석으로 영향받는 파일 파악
2. `_workspace/` 디렉토리를 프로젝트 루트에 생성한다
3. 입력을 정리하여 `_workspace/00_input.md`에 저장한다
4. 요청 범위에 따라 **투입 에이전트를 결정**한다 (아래 "작업 유형별 모드" 참조)

### Phase 2: 팀 구성 및 실행

팀을 구성하고 작업을 할당한다. 작업 간 의존 관계:

| 순서 | 작업 | 담당 | 의존 | 산출물 |
|------|------|------|------|--------|
| 1 | 설계 | interview-designer | 없음 | 설계 문서 (`_workspace/01_design.md`) |
| 2a | AI 구현 | ai-engineer | 작업 1 | 프롬프트/분석 코드 |
| 2b | UI 구현 | frontend-dev | 작업 1 | React 컴포넌트 |
| 2c | 백엔드 구현 | backend-dev | 작업 1 | API/DB 코드 |
| 3a | 기능 검증 | qa-engineer | 작업 2a,2b,2c | 검증 보고서 (`_workspace/02_qa_report.md`) |
| 3b | 코드 리뷰 | code-reviewer | 작업 2a,2b,2c | 리뷰 보고서 (`_workspace/03_review.md`) |

작업 2a, 2b, 2c는 **병렬 실행**한다.

**팀원 간 소통:**
- interview-designer 완료 → ai-engineer에게 프롬프트 요구사항, frontend에게 UI 요구사항, backend에게 데이터 요구사항
- ai-engineer ↔ backend: API 스키마 조율
- frontend ↔ backend: 응답 형식 조율
- qa-engineer: 각 모듈 완성 직후 **점진적 검증** (incremental QA)
- code-reviewer: qa와 **병렬로** 코드 품질/보안/성능 리뷰 (항상 투입)

### Phase 3: 통합 및 보고

1. QA 검증 결과를 확인한다
2. 🔴 필수 수정이 모두 반영되었는지 확인한다
3. 최종 요약을 사용자에게 보고한다:
   - 변경된 파일 목록
   - 주요 변경 사항
   - QA 검증 결과
   - 잔여 이슈 (있는 경우)

## 작업 유형별 모드

| 사용자 요청 패턴 | 실행 모드 | 투입 에이전트 |
|----------------|----------|-------------|
| "새 면접 유형 추가", "면접 플로우 변경" | **풀 파이프라인** | 5명 전원 |
| "프롬프트 튜닝", "분석 품질 개선" | **AI 모드** | interview-designer + ai-engineer + qa |
| "UI 수정", "새 페이지 추가" | **프론트 모드** | frontend-dev + qa |
| "API 추가", "DB 스키마 변경", "쿼타 로직" | **백엔드 모드** | backend-dev + qa |
| "버그 수정" | **디버그 모드** | 영향 범위에 따라 선택 + qa |
| "꼬리질문 로직 변경" | **플로우 모드** | interview-designer + ai-engineer + frontend + qa |
| "리팩토링", "코드 정리", "구조 개선" | **리팩토링 모드** | 영향 도메인의 개발자 + qa (`refactoring` 스킬 참조) |

**규모 판단 기준**: 영향 파일 3개 이하 → 소규모(에이전트 2~3명), 4개 이상 → 중규모 이상(전원 또는 4명)

## 데이터 전달 프로토콜

| 전략 | 방식 | 용도 |
|------|------|------|
| 파일 기반 | `_workspace/` | 설계 문서, 검증 보고서 |
| 메시지 기반 | SendMessage | API 조율, 버그 리포트, 수정 요청 |
| 태스크 기반 | TaskCreate/TaskUpdate | 진행 상황 추적, 의존 관계 관리 |

## 에러 핸들링

| 에러 유형 | 전략 |
|----------|------|
| 요구사항 모호 | 기존 플로우 기준 최소 변경 제안, 가정 사항 문서화 |
| 에이전트 실패 | 1회 재시도 → 실패 시 해당 산출물 없이 진행, 보고서에 명시 |
| QA에서 🔴 발견 | 해당 개발자에 수정 요청 → 재작업 → 재검증 (최대 2회) |
| API 응답 불일치 | frontend ↔ backend 직접 소통으로 해결 |

## 테스트 시나리오

### 정상 흐름
**프롬프트**: "이력서 기반 면접에 자기소개 질문을 추가해줘"
**기대 결과**:
- interview-designer: 자기소개 질문 카테고리 설계, 플로우 위치 결정
- ai-engineer: 자기소개 질문 생성 프롬프트, 답변 평가 기준 추가
- frontend-dev: SetupPage에 자기소개 옵션, InterviewPage에 해당 UI
- backend-dev: 필요 시 DB 스키마/API 변경
- qa-engineer: 자기소개 포함 면접 플로우 전체 검증

### 에러 흐름
**프롬프트**: "면접 분석이 가끔 실패해요"
**기대 결과**:
- 디버그 모드 → ai-engineer + backend-dev + qa 투입
- ai-engineer: 프롬프트 파싱 실패 케이스 분석
- backend-dev: API 에러 로그, 타임아웃 확인
- qa-engineer: 재현 시나리오 작성, 경계값 테스트
