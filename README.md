# Smart Reader

一个本地优先的阅读与资料整理工具，用来收集、组织、检索和回看长文本内容。

Smart Reader 基于 `React + Vite + Express` 构建，适合经常保存技术文章、微信公众号内容、研究笔记、Markdown 文档、PDF 和 Word 文件的人。它的目标不是做一个“收藏链接的仓库”，而是把零散资料整理成一个真正可读、可查、可长期积累的个人阅读库。

如果这个项目对你有帮助，欢迎点一个 Star。

## 项目简介

很多稍后读工具更偏向“先存起来”，但不太关注后续的阅读、整理和检索体验。Smart Reader 更关注完整流程：

- 采集内容
- 分类整理
- 持续阅读
- 快速搜索
- 回看历史
- 本地保存

它尤其适合以下场景：

- 开发者整理技术文章和参考资料
- 安全研究人员保存漏洞分析、攻防笔记和案例文章
- 学生或研究者构建自己的阅读资料库
- 重度阅读用户管理长期积累的长文内容

## 核心功能

- **文章导入**
  支持从微信公众号链接、保存下来的 HTML、Markdown、PDF、DOCX 等来源导入内容。

- **文件夹管理**
  支持按文件夹整理文章，并可进行批量移动，让资料库保持清晰。

- **阅读器体验**
  提供独立阅读视图，支持阅读进度和阅读位置恢复，便于连续阅读长内容。

- **全文检索**
  可按标题、标签和内容进行搜索，避免旧资料沉没。

- **状态与时间筛选**
  支持按已读/未读、今天/本周/本月等维度快速筛选内容。

- **本地优先存储**
  文章元数据和上传文件都保存在本地，便于备份、迁移和自托管部署。

- **导入增强能力**
  支持微信公众号内容解析、自定义过滤规则，以及为抓取场景配置 HTTP/HTTPS 代理。

## 项目特点

- 本地优先，不依赖云端服务
- 既适合个人本机使用，也适合部署到 VPS 或 NAS
- 面向“长期阅读资料管理”，而不只是临时收藏链接
- 支持技术文章、研究材料和多种文档格式
- 已提供 Docker 打包与部署支持

## 为什么做 Smart Reader

很多阅读收藏工具存在几个常见问题：

- 依赖云服务，迁移和自托管不方便
- 更像书签箱，缺少后续阅读体验
- 对长文本、技术资料、微信公众号文章支持一般
- 积累久了之后，搜索和整理成本很高

Smart Reader 的思路比较直接：

- 本地保存
- 结构清晰
- 搜索可用
- 阅读顺手
- 部署简单

## 功能列表

- 从微信公众号链接或 HTML 导入文章
- 上传 Markdown、HTML、PDF、DOCX 文件
- 使用文件夹组织内容
- 标记文章已读/未读
- 按标题、标签、内容搜索
- 按时间和阅读状态筛选
- 保存阅读位置
- 配置文本过滤规则
- 配置 HTTP/HTTPS 代理抓取微信公众号内容
- 支持本地运行和 Docker 部署

## 技术栈

- `React 19`
- `Vite`
- `TypeScript`
- `Express`
- `Zustand`
- `Tailwind CSS v4`
- `Docker`

## 项目结构

```text
.
+-- src/
|   +-- app/
|   |   +-- store.ts
|   |   `-- types.ts
|   +-- components/
|   |   +-- app/
|   |   |   +-- AppShellSkeleton.tsx
|   |   |   `-- GuestScreen.tsx
|   |   +-- layout/
|   |   |   `-- Sidebar.tsx
|   |   +-- modals/
|   |   |   +-- MoveToFolderModal.tsx
|   |   |   +-- NoticeModal.tsx
|   |   |   +-- SettingsModal.tsx
|   |   |   `-- Uploader.tsx
|   |   `-- reader/
|   |       +-- ArticleReader.tsx
|   |       `-- MarkdownViewer.tsx
|   +-- lib/
|   |   +-- api.ts
|   |   +-- useSettings.ts
|   |   +-- utils.ts
|   |   `-- wechatConverter.ts
|   +-- App.tsx
|   +-- index.css
|   `-- main.tsx
+-- server.ts
+-- Dockerfile
`-- docker-compose.yml
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动项目

```bash
npm run dev
```

打开：

```text
http://127.0.0.1:3000
```

## Docker

构建镜像：

```bash
docker build -t smart-reader:latest .
```

运行容器：

```bash
docker run -d \
  --name smart-reader \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/uploads:/app/uploads \
  smart-reader:latest
```

或者使用 Compose：

```bash
docker compose up -d --build
```

## 数据存储

Smart Reader 默认将数据保存在本地：

- 文章元数据：`data/db.json`
- 上传文件：`uploads/`

这意味着你可以很方便地进行：

- 本地备份
- 手动迁移
- 自托管部署
- 数据长期保留

## 适用场景

- 保存安全研究和漏洞分析文章
- 归档微信公众号技术内容
- 搭建个人阅读资料库
- 构建可搜索的知识输入仓库
- 在团队内部部署轻量阅读站点

## 开发说明

- 默认服务端口为 `3000`
- 可通过环境变量覆盖 `PORT` 和 `HOST`
- 开发环境已启用 Vite 预热，减少首次打开的等待时间
- 项目当前不依赖 Firebase 或其他云端后端服务

## 路线图

- 更好的批量操作体验
- 更完善的文件夹管理能力
- 更细的文章元数据编辑能力
- 更好的移动端阅读体验
- 更稳健的微信公众号导入流程

## 参与贡献

欢迎提交 Issue 和 PR。

比较有价值的贡献方向：

- 带复现步骤的 Bug 报告
- UI 和交互优化
- 导入流程稳定性改进
- 搜索和阅读体验优化
- 部署和打包流程完善

## License

在发布到 GitHub 之前，建议补充一个明确的开源许可证。
