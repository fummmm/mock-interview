---
name: conventional-commit
description: "Conventional Commits 기반 커밋 가이드. 브랜치의 변경사항을 분석하여 논리적 커밋 단위로 분리하고, Angular 스타일 커밋 메시지를 생성한다. 사용자가 확인 후 커밋을 실행한다. '커밋', 'commit', '커밋 정리', '커밋 메시지', '변경사항 정리', '커밋 분리', '작업 단위 커밋' 키워드에 트리거된다. '/conventional-commit'으로 직접 호출할 수 있다. 단, 자동 커밋은 하지 않으며 반드시 사용자 확인을 거친다."
---

# Conventional Commit — 커밋 분리 및 메시지 가이드

브랜치의 변경사항을 분석하여 논리적 단위로 분리하고, Conventional Commits + Angular 스타일 메시지를 생성한다. **자동 커밋하지 않고 사용자 확인 후 실행한다.**

## 대상 에이전트

모든 에이전트가 공유한다. 작업 완료 후 커밋이 필요할 때 사용한다.

## 커밋 메시지 형식

```
<type>(<scope>): <subject>

[body]

[footer]
```

### Type (필수)

| type | 용도 | 예시 |
|------|------|------|
| `feat` | 새 기능 추가 | 자기소개 질문 카테고리 추가 |
| `fix` | 버그 수정 | 꼬리질문 판단 로직 수정 |
| `refactor` | 동작 변경 없는 코드 구조 개선 | InterviewPage 컴포넌트 분리 |
| `style` | 포매팅, 세미콜론 등 코드 의미 변경 없음 | Prettier 일괄 적용 |
| `chore` | 빌드, 설정, 도구 변경 | ESLint/Prettier 설정 추가 |
| `docs` | 문서 변경 | CLAUDE.md 업데이트 |
| `test` | 테스트 추가/수정 | 쿼타 RPC 테스트 추가 |
| `perf` | 성능 개선 | Supabase 쿼리 최적화 |
| `ci` | CI/CD 설정 | GitHub Actions 워크플로우 |
| `build` | 빌드 시스템, 의존성 변경 | Vite 설정 변경 |

### Scope (선택, 권장)

이 프로젝트의 scope 체계:

| scope | 대상 |
|-------|------|
| `interview` | 면접 플로우 (InterviewPage, 관련 훅) |
| `analysis` | AI 분석 파이프라인 (analyze-text, analyze-vision, useAnalysis) |
| `prompt` | LLM 프롬프트 (질문 생성, 답변 분석) |
| `setup` | 면접 설정 (SetupPage) |
| `report` | 리포트 (ReportPage) |
| `admin` | 관리자 대시보드 (Admin*) |
| `auth` | 인증/인가 (authStore, LoginPage) |
| `supabase` | DB 스키마, RLS, 쿼타 |
| `media` | 웹캠/오디오/STT (미디어 훅, Whisper) |
| `ui` | 공용 UI 컴포넌트 |
| `config` | 프로젝트 설정 (ESLint, Prettier, Vite) |
| `harness` | .claude/ 에이전트/스킬 |

### Subject 규칙
- 명령형 현재시제 사용: "add" (O), "added" (X), "adds" (X)
- 첫 글자 소문자
- 마침표 없음
- 50자 이내

### Body (선택)
- **왜** 변경했는지 설명 (what은 diff가 보여준다)
- 빈 줄로 subject와 분리
- 72자 줄바꿈

### Footer (선택)
- `BREAKING CHANGE:` — 하위 호환성 깨지는 변경
- `Refs:` — 관련 이슈 번호

## 워크플로우

### 1단계: 변경사항 분석

`git status`와 `git diff`를 실행하여 변경된 파일 목록을 파악한다.

### 2단계: 커밋 단위 분리

변경 파일을 논리적 단위로 그룹핑한다. 분리 기준:

| 기준 | 설명 | 예시 |
|------|------|------|
| **기능 단위** | 하나의 기능/수정에 관련된 파일끼리 | 질문 생성 로직 변경 → questions.js + api/openrouter.js |
| **레이어 단위** | 설정/인프라 vs 비즈니스 로직 | .prettierrc + eslint.config.js = 하나의 chore 커밋 |
| **독립성** | 다른 변경과 무관하게 이해 가능한 단위 | DeviceDropdown 분리는 독립 커밋 |

**분리 원칙:**
- 한 커밋에 feat + refactor를 섞지 않는다
- 포매팅 변경(style)은 로직 변경과 분리한다
- 설정 변경(chore)은 코드 변경과 분리한다

### 3단계: 커밋 제안

각 그룹에 대해 다음을 제시한다:

```
## 커밋 1/N
**파일**: [스테이징할 파일 목록]
**메시지**: refactor(interview): extract DeviceDropdown to separate component
**이유**: InterviewPage.jsx에서 독립적인 DeviceDropdown 컴포넌트를 분리하여 가독성 향상

> 이 커밋을 진행할까요? (y/수정/건너뛰기)
```

### 4단계: 사용자 확인 후 실행

사용자가 승인하면 해당 파일만 스테이징하고 커밋을 실행한다:

```bash
git add <파일들>
git commit -m "<conventional commit message>"
```

**사용자 승인 없이 절대 커밋하지 않는다.**

## 커밋 분리 예시

### 이번 세션의 변경사항을 분리한다면:

```
커밋 1: chore(harness): add domain-specific mock-interview harness
  → .claude/agents/*.md, .claude/skills/*/SKILL.md, .claude/CLAUDE.md

커밋 2: chore(config): add Prettier and ESLint integration with hooks
  → .prettierrc, eslint.config.js, .claude/settings.json, .claude/hooks/format.sh, package.json

커밋 3: refactor(interview): extract DeviceDropdown component
  → src/components/DeviceDropdown.jsx, src/pages/InterviewPage.jsx

커밋 4: refactor(interview): extract BriefingPhase and ReadyPhase components
  → src/components/interview/BriefingPhase.jsx, src/components/interview/ReadyPhase.jsx,
    src/pages/InterviewPage.jsx

커밋 5: refactor(utils): extract formatTime utility function
  → src/lib/utils.js, src/pages/InterviewPage.jsx
```

## 주의사항

- `git add .` 또는 `git add -A` 사용 금지 — 파일을 명시적으로 지정한다
- `.env`, 시크릿 파일이 포함되어 있지 않은지 매번 확인한다
- 커밋 전 `npm run build` 통과 확인을 권장한다
- 사용자가 커밋 메시지를 수정하고 싶으면 즉시 반영한다
