# Meal-recommender agent image → ghcr.io/emtabiraobarias/fridge-planner
#
# OpenAI provider (Semantic Kernel backend) — no Claude Agent SDK, so no Node.js
# runtime dependency (that requirement was specific to the Anthropic provider). This
# also means `holodeck deploy build` now supports this agent directly, if we later
# want to move off this manual Dockerfile path.
#
# Port/protocol default to 8001/rest to match docker-compose(.prod).yml's holodeck
# service and HOLODECK_URL=http://holodeck:8001. Runtime secret OPENAI_API_KEY is
# injected by compose via model.api_key: ${OPENAI_API_KEY}, never baked in.
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
