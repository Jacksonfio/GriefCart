FROM node:20-alpine

WORKDIR /app

# Copy server files
COPY server/package.json server/
RUN cd server && npm install --omit=dev

# Copy server source
COPY server/ server/

# Copy built frontend
COPY dist/ dist/

# Expose port
EXPOSE 3001

# Start
ENV PORT=3001
ENV JWT_SECRET=griefcart-prod-change-this-in-production

CMD ["node", "server/index.js"]