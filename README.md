# 钢管系统服务端

钢管系统（GangGuan）是一个游戏研发项目管理系统，本仓库为服务端实现。

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | >= 18 | 运行环境 |
| TypeScript | ^5.6.3 | 类型系统 |
| Express | ^4.21.1 | Web 框架 |
| WebSocket (ws) | ^8.18.0 | 实时通信 |
| Prisma | ^5.22.0 | ORM |
| MySQL | >= 8.0 | 数据库 |
| bcrypt | ^5.1.1 | 密码加密 |
| express-session | ^1.18.1 | 会话管理 |

## 目录结构

```
GangGuan-server/
├── prisma/
│   └── schema.prisma          # 数据库模型定义
├── src/
│   ├── app.ts                 # 应用入口
│   ├── config/
│   │   └── index.ts           # 配置加载
│   ├── middleware/
│   │   ├── auth.ts            # 认证中间件
│   │   └── errorHandler.ts    # 错误处理
│   ├── routes/
│   │   ├── auth.ts            # 认证路由
│   │   ├── users.ts           # 用户路由
│   │   ├── projects.ts        # 项目路由
│   │   ├── phase-templates.ts # 阶段模板路由
│   │   ├── plannings.ts       # 规划路由
│   │   ├── tasks.ts           # 任务路由
│   │   └── histories.ts       # 历史记录路由
│   ├── services/
│   │   ├── auth.service.ts    # 认证服务
│   │   ├── user.service.ts    # 用户服务
│   │   ├── project.service.ts # 项目服务
│   │   ├── planning.service.ts # 规划服务
│   │   ├── phase-template.service.ts # 阶段模板服务
│   │   └── task.service.ts    # 任务服务
│   ├── ws/
│   │   ├── index.ts           # WebSocket 服务器
│   │   ├── connection.ts      # 连接管理器
│   │   └── broadcast.ts       # 广播工具
│   ├── utils/
│   │   ├── id.ts              # ID 生成
│   │   ├── prisma.ts          # Prisma 客户端
│   │   └── response.ts        # 响应格式
│   └── __tests__/
│       ├── setup.ts           # 测试设置
│       ├── auth.service.test.ts
│       └── connection.test.ts
├── scripts/
│   └── test-integration.sh    # 集成测试脚本
├── server.json                # 服务端配置
├── .env                       # 环境变量
├── package.json
├── tsconfig.json
└── jest.config.js
```

## 快速开始

### 1. 环境准备

- Node.js >= 18
- MySQL >= 8.0

### 2. 安装依赖

```bash
npm install
```

### 3. 配置数据库

编辑 `.env` 文件，配置数据库连接：

```env
DATABASE_URL="mysql://用户名:密码@localhost:3306/gangguan"
```

### 4. 创建数据库

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS gangguan"
```

### 5. 初始化数据库

```bash
npx prisma db push
```

### 6. 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm start
```

服务将在 `http://localhost:3001` 启动。

## 配置说明

### server.json

```json
{
  "port": 3001,
  "cors": {
    "origin": ["http://localhost:3000"],
    "credentials": true
  },
  "session": {
    "secret": "your-session-secret",
    "maxAge": 86400000
  }
}
```

| 配置项 | 说明 |
|--------|------|
| port | 服务端监听端口 |
| cors.origin | 允许跨域的前端地址 |
| cors.credentials | 是否允许携带 Cookie |
| session.secret | Session 加密密钥 |
| session.maxAge | Session 有效期（毫秒） |

## API 文档

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | 登录 |
| POST | /api/auth/logout | 登出 |
| GET | /api/auth/me | 获取当前用户 |

### 用户

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/users | 获取所有用户 |
| GET | /api/users/:id | 获取单个用户 |
| POST | /api/users | 创建用户（管理员） |
| PUT | /api/users/:id | 更新用户 |
| DELETE | /api/users/:id | 删除用户（管理员） |

### 项目

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/projects | 获取所有项目 |
| GET | /api/projects/:id | 获取单个项目 |
| POST | /api/projects | 创建项目 |
| PUT | /api/projects/:id | 更新项目 |
| DELETE | /api/projects/:id | 删除项目 |

### 阶段模板

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/projects/:projectId/phase-templates | 获取项目阶段模板 |
| POST | /api/projects/:projectId/phase-templates | 创建阶段模板 |
| PUT | /api/projects/:projectId/phase-templates/:id | 更新阶段模板 |
| DELETE | /api/projects/:projectId/phase-templates/:id | 删除阶段模板 |
| PUT | /api/projects/:projectId/phase-templates/reorder | 重排序 |

### 规划

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/projects/:projectId/plannings | 获取项目规划 |
| GET | /api/plannings/:id | 获取单个规划 |
| POST | /api/projects/:projectId/plannings | 创建规划 |
| PUT | /api/plannings/:id | 更新规划 |
| DELETE | /api/plannings/:id | 删除规划 |

### 任务

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/tasks/project/:projectId | 获取项目任务 |
| GET | /api/tasks/planning/:planningId | 获取规划任务 |
| GET | /api/tasks/:id | 获取单个任务 |
| POST | /api/tasks | 创建任务 |
| PUT | /api/tasks/:id | 更新任务 |
| DELETE | /api/tasks/:id | 删除任务 |
| PATCH | /api/tasks/:id/move | 移动任务状态 |
| PATCH | /api/tasks/:id/phases/:phaseId/progress | 更新阶段进度 |

### 历史记录

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/tasks/:id/histories | 获取任务历史 |
| GET | /api/tasks/:id/progress-histories | 获取进度历史 |
| GET | /api/projects/:projectId/progress-histories | 获取项目进度历史 |

## WebSocket

### 连接地址

```
ws://localhost:3001/ws
```

### 认证流程

1. 客户端连接 WebSocket
2. 发送认证消息：
```json
{
  "type": "auth",
  "userId": "用户ID"
}
```
3. 服务端验证后发送 `sync:init` 消息，包含全量数据

### 消息格式

```json
{
  "id": "消息ID",
  "type": "消息类型",
  "payload": {},
  "timestamp": "ISO时间戳"
}
```

### 消息类型

| 类型 | 说明 |
|------|------|
| sync:init | 初始数据同步 |
| task:create | 任务创建 |
| task:update | 任务更新 |
| task:delete | 任务删除 |
| project:create | 项目创建 |
| project:update | 项目更新 |
| project:delete | 项目删除 |
| planning:create | 规划创建 |
| planning:update | 规划更新 |
| planning:delete | 规划删除 |

## 测试

### 单元测试

```bash
npm test
```

### 集成测试

```bash
# 确保服务端已启动
chmod +x scripts/test-integration.sh
./scripts/test-integration.sh
```

## 演示账号

| 工号 | 密码 | 角色 |
|------|------|------|
| admin | admin123 | 管理员 |
| EMP001 | 123456 | PM |
| EMP002 | 123456 | 程序(服务端) |
| EMP003 | 123456 | 策划 |

## 部署

### 生产环境配置

1. 修改 `.env` 中的数据库连接
2. 修改 `server.json` 中的：
   - `session.secret`：使用随机强密钥
   - `cors.origin`：配置前端域名
3. 构建并启动：

```bash
npm run build
npm start
```

### 使用 PM2 部署

```bash
npm install -g pm2
pm2 start dist/app.js --name gangguan-server
pm2 save
pm2 startup
```

## 常见问题

### 数据库连接失败

检查 MySQL 服务是否启动，`.env` 中的连接信息是否正确。

### 跨域错误

检查 `server.json` 中的 `cors.origin` 是否包含前端地址。

### Session 丢失

当前使用内存存储 Session，服务重启后会丢失。如需持久化，可改用 `express-mysql-session`。
