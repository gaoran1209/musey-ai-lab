<div align="center">
<img width="1200" height="475" alt="产品封面图" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# MUSEY AI Lab

一个由 Google Gemini 提供支持的，基于节点的视觉 AI 创作画布，专为直观的图像生成和编辑工作流而设计。
</div>

## ✨ 核心特性

- **无限视觉流画布 (Infinite Visual Flow Canvas)**：基于 React Flow 构建，为您提供无缝的工作空间来排列节点、平移及缩放。
- **基于节点的 AI 工作流 (Node-Based AI Workflows)**：通过连接图像节点来可视化地构建图像生成和编辑管道。支持拖拽图像快速开始。
- **Gemini 强力驱动 (Powered by Gemini)**：通过 Google GenAI SDK 深度集成 Gemini 模型，提供高质量、极速的图像生成体验。
- **生成历史与追踪 (Generation History & Tracking)**：内置历史记录面板，方便追踪提示词 (Prompt)、生成状态以及响应耗时。
- **双语支持 (Bilingual Support)**：界面支持中英双语 (`zh`/`en`) 实时切换。
- **本地密钥管理 (Local Key Management)**：每位用户在浏览器内输入并保存自己的 Gemini API Key，不依赖部署平台注入。

## 🚀 快速启动指南

**环境依赖：** [Node.js](https://nodejs.org/) (推荐 v20 或更高版本)

1. **安装项目依赖：**
   ```bash
   npm install
   ```

2. **启动应用后输入 API 密钥：**
   当前仓库采用 demo 模式，不从 `.env`、Vercel 环境变量或构建产物中注入 Gemini API Key。
   请在应用右侧用户菜单内手动输入您自己的 Google Gemini API Key，密钥只会保存在当前浏览器的本地存储中。

3. **运行开发服务器：**
   ```bash
   npm run dev
   ```

4. **打开浏览器体验：**
   在浏览器中访问终端显示的本地地址（通常是 `http://localhost:3000`）即可开始您的 AI 创作。

## ☁️ Demo 部署说明

- 可以直接部署到 Vercel，作为静态前端站点访问。
- 不要在 Vercel 中配置 `GEMINI_API_KEY` 供前端使用；当前 demo 模式下每位用户都应在浏览器内输入自己的密钥。
- 如果未来要做公开产品，再把 Gemini 调用迁移到服务端 API。

## 🔁 GitHub Actions + Vercel

仓库已经包含两条工作流：

- `CI`：在 `main`、`codex/**` 和 Pull Request 上执行 `npm ci`、`npm run lint`、`npm run build`
- `Deploy To Vercel`：在 `main` 分支更新后自动部署到 Vercel 生产环境

在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 中配置以下 secrets：

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

首次接入建议：

1. 在 Vercel 中导入该 GitHub 仓库并完成项目创建
2. 从本地执行 `vercel link` 或在 Vercel 项目设置中找到 `org id` 和 `project id`
3. 把上述三个值写入 GitHub Actions secrets
4. 合并到 `main` 后，由 `Deploy To Vercel` 自动发布

## 🛠️ 技术栈说明

- **前端框架 (Frontend Framework)**：[React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
- **视觉画布底座 (Visual Canvas)**：[React Flow (@xyflow/react)](https://reactflow.dev/)
- **UI 样式 (Styling)**：[Tailwind CSS v4](https://tailwindcss.com/)
- **AI 模型集成 (AI Integration)**：[@google/genai](https://github.com/google/generative-ai-js)
- **图标与动画 (Icons & Animation)**：[Lucide React](https://lucide.dev/) + [Motion](https://motion.dev/)
