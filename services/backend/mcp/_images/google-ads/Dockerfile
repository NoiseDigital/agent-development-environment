# Builds the Google Ads MCP server from the upstream open-source repo.
# No business logic lives here — we're just packaging their code into an image
# we control (version pin, private registry, etc.).
#
# To update to a newer version, change the GOOGLE_ADS_MCP_REF build arg.
# Re-build and push via CI or: docker compose build mcp-google-ads

FROM python:3.13-slim

ARG GOOGLE_ADS_MCP_REF=main

RUN pip install --no-cache-dir pipx && \
    pipx install "git+https://github.com/googleads/google-ads-mcp.git@${GOOGLE_ADS_MCP_REF}"

ENV PATH="/root/.local/bin:${PATH}"
ENV FASTMCP_HOST=0.0.0.0
ENV PORT=8080

EXPOSE 8080

CMD ["google-ads-mcp"]
