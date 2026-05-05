FROM google/cloud-sdk:slim

ENV APP_PATH="${APP_PATH:-/workspace}"

WORKDIR "${APP_PATH}"
ENTRYPOINT ["bash"]
USER "root"

RUN apt-get update -y \
    && apt-get upgrade -y -o APT::Keep-Downloaded-Packages=false \
    && apt-get install -y -o APT::Keep-Downloaded-Packages=false --no-install-recommends \
    curl \
    direnv \
    jq \
    shellcheck \
    nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install uv for Python environment management and IDE support
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

