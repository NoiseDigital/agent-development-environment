# Use the official lightweight Python image.
FROM python:3.13-slim

# Set the working directory in the container.
WORKDIR /app

# Install uv, our package installer
RUN pip install uv

# Copy the pyproject.toml and install dependencies.
COPY pyproject.toml .
RUN uv pip install --system .

# Copy the rest of the application's code.
COPY . .

# Expose the port that the application will run on.
EXPOSE 8080

# Run the application.
CMD ["uvicorn", "server:starlette_app", "--host", "0.0.0.0", "--port", "8080"]
