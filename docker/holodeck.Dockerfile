FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir holodeck-ai exceptiongroup

WORKDIR /app
COPY . .

EXPOSE 8001
CMD ["holodeck", "serve", "/app/agent.yaml", "--host", "0.0.0.0", "--port", "8001", "--protocol", "rest"]
