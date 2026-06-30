FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy application
COPY . .

# Build application
#RUN npm run build

EXPOSE 3000

# Run development server
CMD ["npm", "run", "dev"]
