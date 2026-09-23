# 1. Use official Node.js LTS image
FROM node:20-alpine

# 2. Set working directory
WORKDIR /app

# 3. Print Node and npm versions (optional, for verification)
RUN node -v && npm -v

# 4. Copy package.json and package-lock.json
COPY package*.json ./

# 5. Install dependencies
RUN npm install

# 6. Copy all project files
COPY . .

# # 7. Build Next.js project
RUN npm run build

# 8. Expose port 3001
EXPOSE 3001

# 9. Set environment variable for port
ENV PORT=3001

# 10. Start the app in production mode on port 3001
CMD ["npm", "run", "start"]
