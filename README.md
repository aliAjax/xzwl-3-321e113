# 冷链配送管理平台

专为小型冷链配送公司设计的后端管理平台，实现从订单创建到最终签收的全流程管理。

## 功能特性

### 核心模块
- **客户管理**：客户信息维护、优先级配置
- **订单管理**：订单创建、温区要求设置、状态追踪
- **车辆管理**：车辆信息、温区能力配置、可用时间管理
- **司机管理**：司机信息、驾驶证、排班管理
- **线路管理**：配送线路配置、站点顺序、预计时间
- **调度中心**：智能调度、车辆温区匹配、时间冲突检测
- **装车批次**：批次创建、订单装车、批次确认出库
- **配送执行**：节点状态更新、时间记录、位置文本、异常说明
- **订单追踪**：从入仓到签收的完整生命周期查询

### 关键特性
1. **温区智能匹配**：调度时自动检查车辆温区是否满足订单要求
2. **时间冲突检测**：自动检查车辆和司机的可用时间，避免冲突
3. **完整节点追踪**：记录每个节点的时间、位置、温度、异常信息
4. **角色权限控制**：管理员、调度员、司机三种角色，权限隔离
5. **JWT认证**：安全的用户认证机制

## 技术栈

### 前端
- React 18 + TypeScript
- Tailwind CSS 3
- Zustand (状态管理)
- React Router (路由)
- Lucide React (图标)
- Vite (构建工具)

### 后端
- Express.js 4 + TypeScript
- SQLite (数据库，轻量级无需额外安装)
- better-sqlite3 (同步ORM)
- JWT (认证)
- bcryptjs (密码加密)
- Zod (参数验证)

## 项目结构

```
xzwl-3/
├── api/                      # 后端代码
│   ├── config/              # 配置
│   ├── controllers/         # 控制器层
│   ├── db/                  # 数据库连接
│   ├── middleware/          # 中间件
│   ├── repositories/        # 仓储层
│   ├── routes/              # 路由
│   ├── services/            # 业务逻辑层
│   └── index.ts             # 入口
├── src/                      # 前端代码
│   ├── components/          # 组件
│   ├── pages/               # 页面
│   ├── store/               # 状态管理
│   ├── utils/               # 工具函数
│   ├── App.tsx              # 主应用
│   └── main.tsx             # 入口
├── shared/                   # 共享类型定义
├── scripts/                  # 脚本
│   ├── init-db.ts           # 数据库初始化
│   └── seed-db.ts           # 初始数据
├── .trae/documents/          # 设计文档
│   ├── prd.md               # 产品需求文档
│   └── tech-arch.md         # 技术架构文档
└── package.json             # 项目配置
```

## 快速开始

### 前置要求
- Node.js >= 18
- npm 或 pnpm

### 安装步骤

1. **安装依赖**
```bash
npm install
```

2. **初始化数据库**
```bash
npm run db:init
```

3. **导入初始数据**
```bash
npm run db:seed
```

4. **启动开发服务器**
```bash
npm run dev
```

这将同时启动：
- 前端开发服务器：http://localhost:5173
- 后端API服务器：http://localhost:3001

### 默认账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | 123456 | 管理员 |
| dispatcher | 123456 | 调度员 |
| driver1 | 123456 | 司机 |

## API 接口

### 认证
- `POST /api/auth/login` - 用户登录

### 订单
- `GET /api/orders` - 获取订单列表
- `POST /api/orders` - 创建订单
- `GET /api/orders/:id` - 获取订单详情
- `GET /api/orders/:id/timeline` - 获取订单时间线
- `PUT /api/orders/:id` - 更新订单

### 车辆
- `GET /api/vehicles` - 获取车辆列表
- `POST /api/vehicles` - 创建车辆
- `GET /api/vehicles/available` - 获取可用车辆（含匹配检查）

### 调度
- `POST /api/dispatch/matches` - 获取调度匹配建议
- `POST /api/dispatch` - 创建配送任务
- `GET /api/dispatch/tasks` - 获取配送任务列表

### 配送执行
- `GET /api/delivery/tasks` - 获取司机配送任务
- `POST /api/delivery/nodes/:id/update` - 更新节点状态

### 仪表盘
- `GET /api/dashboard/stats` - 获取统计数据

## 核心业务流程

### 1. 调度员创建配送任务
```
创建订单 → 设置温区要求 → 进入调度中心 → 系统检查车辆可用时间 → 
检查温区匹配 → 分配车辆司机 → 创建装车批次 → 生成配送任务
```

### 2. 司机配送执行
```
接收任务 → 查看装车清单 → 装车确认 → 运输中 → 到达配送点 → 
更新节点状态 → 记录时间/位置 → 正常签收或记录异常 → 配送完成
```

### 3. 订单全流程追踪
```
订单创建 → 入仓登记 → 温区存储 → 装车批次分配 → 装车确认 → 
运输中 → 到达配送点 → 客户签收 → 订单完成
```

## 温区定义

| 温区代码 | 名称 | 温度范围示例 |
|----------|------|-------------|
| frozen | 冷冻 | -18°C ~ -12°C |
| chilled | 冷藏 | 2°C ~ 8°C |
| ambient | 常温 | 15°C ~ 25°C |

## 节点类型

| 节点类型 | 名称 | 说明 |
|----------|------|------|
| warehouse_in | 入仓登记 | 货物进入仓库 |
| loading | 装车确认 | 货物装车完成 |
| departure | 车辆出发 | 车辆离开仓库 |
| arrival | 到达配送点 | 车辆到达客户地点 |
| delivery | 开始配送 | 开始卸货交付 |
| signature | 客户签收 | 客户确认收货 |

## 生产部署

### 构建
```bash
npm run build          # 构建前端
npm run build:server   # 构建后端
```

### 启动生产服务
```bash
npm start
```

### 环境变量
```bash
JWT_SECRET=your-secret-key    # JWT签名密钥
PORT=3001                      # 后端端口
```

## 数据库说明

使用SQLite数据库，数据库文件位于 `data/cold-chain.db`。

### 数据表
- users - 用户表
- customers - 客户表
- orders - 订单表
- vehicles - 车辆表
- drivers - 司机表
- routes - 线路表
- loading_batches - 装车批次表
- delivery_tasks - 配送任务表
- delivery_nodes - 配送节点表

## 设计文档

详细设计请参考：
- [产品需求文档](.trae/documents/prd.md)
- [技术架构文档](.trae/documents/tech-arch.md)

## 开发说明

### 代码规范
- 使用 TypeScript 进行类型安全开发
- 后端采用分层架构：Controller → Service → Repository
- 字段自动映射：数据库 snake_case ↔ TypeScript camelCase
- JSON字段自动序列化/反序列化

### 目录说明
- `shared/types.ts` - 前后端共享的类型定义
- `api/repositories/` - 数据访问层，封装数据库操作
- `api/services/` - 业务逻辑层，实现核心业务规则
- `api/controllers/` - 控制层，处理HTTP请求响应
