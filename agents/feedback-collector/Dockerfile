# Feedback-collector agent image → ghcr.io/emtabiraobarias/fridge-planner-feedback
#
# OpenAI agent (Semantic Kernel backend), so it uses the manual `holodeck serve`
# container path (holodeck deploy build supports Semantic-Kernel backends only).
#
# Port/protocol default to 8002/rest to match docker-compose.yml's holodeck-feedback
# service and FEEDBACK_AGENT_URL=http://holodeck-feedback:8002. Runtime secret
# OPENAI_API_KEY is injected by compose, never baked in.
FROM ghcr.io/justinbarias/holodeck-base:latest

USER root
WORKDIR /app

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
# Serve-only config (no evaluations/observability env refs) — see agent.serve.yaml.
COPY agent.serve.yaml /app/agent.yaml
COPY instructions/ /app/instructions/
COPY schemas/ /app/schemas/

ENV HOLODECK_PORT="8002"
ENV HOLODECK_PROTOCOL="rest"
ENV HOLODECK_AGENT_CONFIG="/app/agent.yaml"
EXPOSE 8002

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8002/health || exit 1

RUN chown -R holodeck:holodeck /app
USER holodeck
ENTRYPOINT ["/app/entrypoint.sh"]
