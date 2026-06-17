#!/bin/bash

# 集成测试脚本
# 使用前请确保服务端已启动: npm run dev

BASE_URL="http://localhost:3001/api"
COOKIE_FILE="/tmp/gangguan-cookie.txt"

echo "=========================================="
echo "钢管系统集成测试"
echo "=========================================="

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 测试计数
TOTAL=0
PASSED=0

# 测试函数
run_test() {
  local name="$1"
  local expected="$2"
  local actual="$3"

  TOTAL=$((TOTAL + 1))

  if [ "$actual" = "$expected" ]; then
    echo -e "${GREEN}✓${NC} $name"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}✗${NC} $name"
    echo "  Expected: $expected"
    echo "  Actual: $actual"
  fi
}

echo ""
echo "1. 健康检查"
echo "------------------------------------------"

RESPONSE=$(curl -s "$BASE_URL/health")
STATUS=$(echo $RESPONSE | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
run_test "GET /api/health" "ok" "$STATUS"

echo ""
echo "2. 用户登录"
echo "------------------------------------------"

RESPONSE=$(curl -s -c $COOKIE_FILE -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"employeeId":"admin","password":"admin123"}')
SUCCESS=$(echo $RESPONSE | grep -o '"success":true')
run_test "POST /api/auth/login (admin)" "success" "$([ -n "$SUCCESS" ] && echo "success" || echo "failed")"

echo ""
echo "3. 获取当前用户"
echo "------------------------------------------"

RESPONSE=$(curl -s -b $COOKIE_FILE "$BASE_URL/auth/me")
NAME=$(echo $RESPONSE | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
run_test "GET /api/auth/me" "系统管理员" "$NAME"

echo ""
echo "4. 用户管理"
echo "------------------------------------------"

RESPONSE=$(curl -s -b $COOKIE_FILE "$BASE_URL/users")
COUNT=$(echo $RESPONSE | grep -o '"id"' | wc -l)
run_test "GET /api/users (获取用户列表)" "true" "$([ $COUNT -gt 0 ] && echo "true" || echo "false")"

echo ""
echo "5. 项目管理"
echo "------------------------------------------"

# 创建项目
RESPONSE=$(curl -s -b $COOKIE_FILE -X POST "$BASE_URL/projects" \
  -H "Content-Type: application/json" \
  -d '{"name":"测试项目","description":"集成测试创建的项目"}')
PROJECT_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
run_test "POST /api/projects (创建项目)" "true" "$([ -n "$PROJECT_ID" ] && echo "true" || echo "false")"

# 获取项目列表
RESPONSE=$(curl -s -b $COOKIE_FILE "$BASE_URL/projects")
COUNT=$(echo $RESPONSE | grep -o '"id"' | wc -l)
run_test "GET /api/projects (获取项目列表)" "true" "$([ $COUNT -gt 0 ] && echo "true" || echo "false")"

echo ""
echo "6. 规划管理"
echo "------------------------------------------"

if [ -n "$PROJECT_ID" ]; then
  # 创建规划
  RESPONSE=$(curl -s -b $COOKIE_FILE -X POST "$BASE_URL/projects/$PROJECT_ID/plannings" \
    -H "Content-Type: application/json" \
    -d '{"name":"测试规划","deadline":"2026-12-31"}')
  PLANNING_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  run_test "POST /api/projects/:id/plannings (创建规划)" "true" "$([ -n "$PLANNING_ID" ] && echo "true" || echo "false")"
else
  echo -e "${RED}✗${NC} 跳过规划测试（项目创建失败）"
fi

echo ""
echo "7. 任务管理"
echo "------------------------------------------"

if [ -n "$PROJECT_ID" ]; then
  # 创建需求单
  RESPONSE=$(curl -s -b $COOKIE_FILE -X POST "$BASE_URL/tasks" \
    -H "Content-Type: application/json" \
    -d "{\"projectId\":\"$PROJECT_ID\",\"itemType\":\"requirement\",\"title\":\"测试需求\",\"description\":\"测试需求描述\",\"priority\":\"high\"}")
  REQ_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  run_test "POST /api/tasks (创建需求单)" "true" "$([ -n "$REQ_ID" ] && echo "true" || echo "false")"

  # 创建任务
  RESPONSE=$(curl -s -b $COOKIE_FILE -X POST "$BASE_URL/tasks" \
    -H "Content-Type: application/json" \
    -d "{\"projectId\":\"$PROJECT_ID\",\"itemType\":\"task\",\"parentRequirementId\":\"$REQ_ID\",\"title\":\"测试任务\",\"description\":\"测试任务描述\",\"priority\":\"medium\",\"planningId\":\"$PLANNING_ID\"}")
  TASK_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  run_test "POST /api/tasks (创建任务)" "true" "$([ -n "$TASK_ID" ] && echo "true" || echo "false")"

  # 获取任务列表
  RESPONSE=$(curl -s -b $COOKIE_FILE "$BASE_URL/tasks/project/$PROJECT_ID")
  COUNT=$(echo $RESPONSE | grep -o '"id"' | wc -l)
  run_test "GET /api/tasks/project/:id (获取任务列表)" "true" "$([ $COUNT -gt 0 ] && echo "true" || echo "false")"
else
  echo -e "${RED}✗${NC} 跳过任务测试（项目创建失败）"
fi

echo ""
echo "8. 登出"
echo "------------------------------------------"

RESPONSE=$(curl -s -b $COOKIE_FILE -X POST "$BASE_URL/auth/logout")
SUCCESS=$(echo $RESPONSE | grep -o '"success":true')
run_test "POST /api/auth/logout" "success" "$([ -n "$SUCCESS" ] && echo "success" || echo "failed")"

echo ""
echo "=========================================="
echo "测试结果: $PASSED/$TOTAL 通过"
echo "=========================================="

# 清理
rm -f $COOKIE_FILE

exit $((TOTAL - PASSED))
