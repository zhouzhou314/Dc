# IS-LM 教学平台镜像（多阶段构建）
# 构建：docker build -t islm-platform .
# 运行：docker compose up（推荐，自带 MySQL）
# 注意：运行阶段保留 src/ 目录 —— agentService/hintService 引用了
#       src/constants/presets.js 与 src/data/questionBank.js（题库数据源）

# ---------- 构建阶段：安装依赖 + 构建前端 ----------
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# ---------- 运行阶段：仅保留生产依赖与产物 ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY server ./server
COPY src ./src
COPY --from=build /app/dist ./dist
EXPOSE 3001
CMD ["node", "server/app.js"]
