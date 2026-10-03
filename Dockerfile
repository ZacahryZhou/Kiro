# 开发用镜像（Nick 维护）。比赛只需本地运行，不做生产优化。
FROM node:22-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN if [ -f prisma/schema.prisma ]; then npx prisma generate; fi
EXPOSE 3000
CMD ["sh", "-c", "if [ -f prisma/schema.prisma ]; then npx prisma generate && npx prisma migrate deploy || exit 1; fi; exec npm run dev -- -H 0.0.0.0"]
