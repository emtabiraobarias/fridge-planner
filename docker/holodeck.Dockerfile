FROM python:3.12-slim

RUN pip install --no-cache-dir holodeck-ai

WORKDIR /app
COPY . .

EXPOSE 8001
CMD ["holodeck", "serve", "/app/agent.yaml", "--host", "0.0.0.0", "--port", "8001", "--protocol", "rest"]
