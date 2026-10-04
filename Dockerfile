# Development image maintained by Nick. The competition build runs locally; production optimization is out of scope.
FROM node:22-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN if [ -f prisma/schema.prisma ]; then npx prisma generate; fi
EXPOSE 3000
# The node_modules volume in docker-compose.yml keeps old packages across rebuilds, so install again
# whenever package-lock.json is newer than what is installed.
CMD ["sh", "-c", "if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then npm install --no-audit --no-fund || exit 1; fi; if [ -f prisma/schema.prisma ]; then npx prisma generate && npx prisma migrate deploy || exit 1; fi; exec npm run dev -- -H 0.0.0.0"]
