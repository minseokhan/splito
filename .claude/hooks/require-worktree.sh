#!/bin/bash
# Worktree Guard — PreToolUse[Edit|Write|NotebookEdit]
# 이 프로젝트의 메인 체크아웃에서 파일을 편집하면 차단한다.
# 모든 작업은 dev에서 분기한 워크트리(.claude/worktrees/<name>) 안에서 한다.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
[ -z "$FILE_PATH" ] && exit 0

# 새 파일·새 폴더일 수 있으니 존재하는 가장 가까운 상위 폴더에서 판정
DIR=$(dirname "$FILE_PATH")
while [ ! -d "$DIR" ] && [ "$DIR" != "/" ]; do DIR=$(dirname "$DIR"); done

GIT_DIR=$(git -C "$DIR" rev-parse --path-format=absolute --git-dir 2>/dev/null) || exit 0
COMMON_DIR=$(git -C "$DIR" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0

# 이 프로젝트 저장소가 아니면 관여하지 않음 (메모리·스크래치패드 등)
PROJECT_COMMON=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
[ "$COMMON_DIR" != "$PROJECT_COMMON" ] && exit 0

# 링크된 워크트리면 git-dir(.git/worktrees/<name>)이 common-dir(.git)과 다르다
[ "$GIT_DIR" != "$COMMON_DIR" ] && exit 0

cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "WORKTREE GUARD: 메인 체크아웃에서는 편집할 수 없습니다. 먼저 dev 기반 워크트리를 만들고 그 안에서 작업하세요: git fetch origin && git worktree add .claude/worktrees/<name> -b <branch> origin/dev  (CLAUDE.md '브랜치·PR 규칙' 참고)"
  }
}
EOF
exit 0
