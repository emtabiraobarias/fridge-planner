# Feedback-collector agent image → ghcr.io/emtabiraobarias/fridge-planner-feedback
#
# OpenAI-provider agent on the manual `holodeck serve` container path. Which
# backend serves it depends on the holodeck version in the base image: Semantic
# Kernel on 0.6.x, the OpenAI Agents SDK backend on >=0.7 (see RUN below).
#
# Port/protocol default to 8002/rest to match docker-compose.yml's holodeck-feedback
# service and FEEDBACK_AGENT_URL=http://holodeck-feedback:8002. Runtime secret
# OPENAI_API_KEY is injected by compose, never baked in.
FROM ghcr.io/justinbarias/holodeck-base:latest

USER root
WORKDIR /app

# Holodeck >=0.7 routes provider:openai to the OpenAI Agents SDK backend, whose
# `openai-agents` package is an optional extra NOT bundled in holodeck-base —
# without it the first chat turn fails with "No module named 'agents'" (health
# stays green because the backend initialises lazily). Pin the extra to the base
# image's own holodeck version so the two can't drift apart.
RUN pip install --no-cache-dir "holodeck-ai[openai-agents]==$(pip show holodeck-ai | awk '/^Version/{print $2}')"

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
