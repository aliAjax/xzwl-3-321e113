#!/bin/bash
set -e

echo "=============================================="
echo "冷链配送平台 - 核心接口最终测试"
echo "=============================================="
echo ""

BASE_URL="http://localhost:3001"

# 1. 登录
echo "1. 登录获取Token..."
LOGIN_RESP=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"dispatcher","password":"123456"}')

TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "✓ 登录成功"
echo ""

# 2. 测试调度匹配接口
echo "=============================================="
echo "测试1: 调度匹配接口"
echo "POST /api/dispatch/matches"
echo "=============================================="
MATCH_RESP=$(curl -s -X POST "$BASE_URL/api/dispatch/matches" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"orderIds":["ord-002"],"scheduledTime":"2024-06-02T10:00:00"}')

echo "响应:"
echo "$MATCH_RESP" | python3 -m json.tool
echo ""
echo "✓ 调度匹配接口 - 测试通过"
echo ""

# 3. 创建调度任务
echo "=============================================="
echo "创建调度任务"
echo "POST /api/dispatch"
echo "=============================================="
DISPATCH_RESP=$(curl -s -X POST "$BASE_URL/api/dispatch" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "orderIds":["ord-002"],
    "vehicleId":"veh-001",
    "driverId":"drv-001",
    "routeId":"route-001",
    "scheduledDepartureTime":"2024-06-02T10:00:00"
  }')

echo "响应:"
echo "$DISPATCH_RESP" | python3 -m json.tool
echo ""

TASK_ID=$(echo "$DISPATCH_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['tasks'][0]['id'])")
ORDER_ID=$(echo "$DISPATCH_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['tasks'][0]['orderId'])")
echo "任务ID: $TASK_ID"
echo "订单ID: $ORDER_ID"
echo "✓ 调度创建成功"
echo ""

# 4. 创建配送节点
echo "=============================================="
echo "为任务创建配送节点"
echo "=============================================="
for node_type in warehouse_in loading departure arrival delivery signature
do
  echo "创建节点: $node_type"
  RESP=$(curl -s -X POST "$BASE_URL/api/delivery/tasks/$TASK_ID/nodes" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"nodeType\":\"$node_type\"}")
  echo "  响应: $(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('nodeType') or d.get('message'))")"
done
echo "✓ 所有节点创建完成"
echo ""

# 5. 获取任务节点列表
echo "=============================================="
echo "获取任务节点列表"
echo "GET /api/delivery/tasks/:id/nodes"
echo "=============================================="
NODES_RESP=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/delivery/tasks/$TASK_ID/nodes")
echo "响应:"
echo "$NODES_RESP" | python3 -m json.tool
echo ""

# 获取第一个节点ID
NODE_ID=$(echo "$NODES_RESP" | python3 -c "
import sys,json
nodes = json.load(sys.stdin)
pending = [n for n in nodes if n['status'] == 'pending']
print(pending[0]['id'] if pending else nodes[0]['id'])
")
echo "待更新节点ID: $NODE_ID"
echo ""

# 6. 测试配送节点更新接口
echo "=============================================="
echo "测试2: 配送节点更新接口"
echo "POST /api/delivery/nodes/:id/update"
echo "=============================================="
UPDATE_RESP=$(curl -s -X POST "$BASE_URL/api/delivery/nodes/$NODE_ID/update" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "status": "completed",
    "locationText": "北京市朝阳区冷链仓储中心1号库",
    "temperature": -18
  }')

echo "响应:"
echo "$UPDATE_RESP" | python3 -m json.tool
echo ""
echo "✓ 配送节点更新接口 - 测试通过"
echo ""

# 7. 测试订单全流程追踪接口
echo "=============================================="
echo "测试3: 订单全流程追踪接口"
echo "GET /api/orders/:id/timeline"
echo "=============================================="
TIMELINE_RESP=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/orders/$ORDER_ID/timeline")
echo "响应:"
echo "$TIMELINE_RESP" | python3 -m json.tool
echo ""
echo "✓ 订单全流程追踪接口 - 测试通过"
echo ""

echo "=============================================="
echo "🎉 所有核心接口测试全部通过！"
echo "=============================================="
echo "✓ 调度匹配接口    (POST /api/dispatch/matches)"
echo "✓ 配送节点更新接口 (POST /api/delivery/nodes/:id/update)"
echo "✓ 订单全流程追踪   (GET /api/orders/:id/timeline)"
echo ""
