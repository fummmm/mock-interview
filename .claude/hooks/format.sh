#!/bin/bash
# PostToolUse hook: Prettier + ESLint auto-format
# stdin으로 JSON을 받아 file_path를 추출하고 포매팅 실행

FILE=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  exit 0
fi

# Prettier: js, jsx, ts, tsx, css, json
if echo "$FILE" | grep -qE '\.(js|jsx|ts|tsx|css|json)$'; then
  npx prettier --write "$FILE" 2>/dev/null
fi

# ESLint: js, jsx, ts, tsx
if echo "$FILE" | grep -qE '\.(js|jsx|ts|tsx)$'; then
  npx eslint --fix "$FILE" 2>/dev/null
fi

exit 0
