# Meal-recommender agent image → ghcr.io/emtabiraobarias/fridge-planner
#
# Anthropic/Claude agent, so it uses the manual `holodeck serve` container path
# (holodeck deploy build supports Semantic-Kernel backends only). The base image
# carries the holodeck runtime + Node.js (required by the Anthropic provider).
#
# Port/protocol default to 8001/rest to match docker-compose(.prod).yml's holodeck
# service and HOLODECK_URL=http://holodeck:8001. Runtime secret CLAUDE_CODE_OAUTH_TOKEN
# is injected by compose, never baked in.
FROM ghcr.io/justinbarias/holodeck-base:latest

USER root
WORKDIR /app

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
# Serve-only config (no evaluations/observability env refs) — see agent.serve.yaml.
COPY agent.serve.yaml /app/agent.yaml
COPY instructions/ /app/instructions/
COPY schemas/ /app/schemas/

ENV HOLODECK_PORT="8001"
ENV HOLODECK_PROTOCOL="rest"
ENV HOLODECK_AGENT_CONFIG="/app/agent.yaml"
EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

RUN chown -R holodeck:holodeck /app
USER holodeck
ENTRYPOINT ["/app/entrypoint.sh"]
