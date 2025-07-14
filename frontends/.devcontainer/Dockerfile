# Use the official Node.js image as a base
FROM node:24

# Set environment variables
ENV PORT=3000

# Set the current working directory inside the container
WORKDIR /workspaces/agent-development-environment/frontends

# Install necessary global packages
RUN npm install -g create-next-app
RUN npm install -g firebase-tools

# Expose ports for React
EXPOSE 3000
EXPOSE $PORT

# Set the default command for the container
CMD ["bash"]