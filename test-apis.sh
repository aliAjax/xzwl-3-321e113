#!/bin/bash

echo "=============================================="
echo "冷链配送平台核心接口测试"
echo "=============================================="
echo ""

# 登录获取token
echo "1. 登录获取Token..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"dispatcher","password":"123456"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
USER_NAME=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['name'])")
echo "✓ 登录成功，用户: $USER_NAME"
echo ""

# 测试1: 调度匹配接口
echo "=============================================="
echo "测试1: 调度匹配接口 POST /api/dispatch/matches"
echo "=============================================="
echo "请求参数: orderIds=[ord-002, ord-003], scheduledTime=2024-06-02T14:00:00"
echo ""

MATCH_RESPONSE=$(curl -s -X POST http://localhost:3001/api/dispatch/matches \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"orderIds":["ord-002","ord-003"],"scheduledTime":"2024-06-02T14:00:00"}')

echo "$MATCH_RESPONSE" | python3 -m json.tool
echo ""
echo "✓ 调度匹配接口测试通过"
echo ""

# 测试2: 创建调度任务
echo "=============================================="
echo "创建调度任务 POST /api/dispatch"
echo "=============================================="
DISPATCH_RESPONSE=$(curl -s -X POST http://localhost:3001/api/dispatch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "orderIds":["ord-002"],
    "vehicleId":"veh-001",
    "driverId":"drv-001",
    "routeId":"route-001",
    "scheduledDepartureTime":"2024-06-02T14:00:00"
  }')

echo "$DISPATCH_RESPONSE" | python3 -m json.tool
echo ""

TASK_ID=$(echo "$DISPATCH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['tasks'][0]['id'])")
ORDER_ID=$(echo "$DISPATCH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['tasks'][0]['orderId'])")
BATCH_ID=$(echo "$DISPATCH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['batch']['id'])")
echo "✓ 调度创建成功"
echo "  批次ID: $BATCH_ID"
echo "  任务ID: $TASK_ID"
echo "  订单ID: $ORDER_ID"
echo ""

# 为任务创建所有配送节点
echo "=============================================="
echo "为任务创建6个配送节点..."
echo "=============================================="
for node_type in warehouse_in loading departure arrival delivery signature
do
  echo "创建节点: $node_type"
  curl -s -X POST "http://localhost:3001/api/delivery/tasks/$TASK_ID/nodes" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"nodeType\":\"$node_type\"}" > /dev/null
done
echo "✓ 所有节点创建完成"
echo ""

# 获取任务节点列表
echo "=============================================="
echo "获取任务节点列表 GET /api/delivery/tasks/:id/nodes"
echo "=============================================="
NODES_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/delivery/tasks/$TASK_ID/nodes")
echo "$NODES_RESPONSE" | python3 -m json.tool
echo ""

# 获取第一个待处理节点ID
NODE_ID=$(echo "$NODES_RESPONSE" | python3 -c "
import sys,json
nodes = json.load(sys.stdin)
pending = [n for n in nodes if n['status'] == 'pending']
print(pending[0]['id'] if pending else '')
")
echo "待更新节点ID: $NODE_ID"
echo ""

# 测试3: 配送节点更新接口
echo "=============================================="
echo "测试2: 配送节点更新接口 POST /api/delivery/nodes/:id/update"
echo "=============================================="
echo "更新节点 $NODE_ID 为已完成状态"
echo ""

UPDATE_RESPONSE=$(curl -s -X POST "http://localhost:3001/api/delivery/nodes/$NODE_ID/update" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "status": "completed",
    "locationText": "北京市朝阳区冷链仓储中心",
    "temperature": -15
  }')

echo "$UPDATE_RESPONSE" | python3 -m json.tool
echo ""
echo "✓ 配送节点更新接口测试通过"
echo ""

# 测试4: 订单全流程追踪接口
echo "=============================================="
echo "测试3: 订单全流程追踪接口 GET /api/orders/:id/timeline"
echo "=============================================="
echo "查询订单 $ORDER_ID 的全流程追踪信息"
echo ""

TIMELINE_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/orders/$ORDER_ID/timeline")
echo "$TIMELINE_RESPONSE" | python3 -m json.tool
echo ""
echo "✓ 订单全流程追踪接口测试通过"
echo ""

echo "=============================================="
echo "所有核心接口测试完成！"
echo "=============================================="
echo "✓ 调度匹配接口 (POST /api/dispatch/matches)"
echo "✓ 配送节点更新接口 (POST /api/delivery/nodes/:id/update)"
echo "✓ 订单全流程追踪接口 (GET /api/orders/:id/timeline)"
echo ""
