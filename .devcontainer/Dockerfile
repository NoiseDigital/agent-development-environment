FROM google/cloud-sdk:slim

ARG APP_PATH=/workspace
ENV APP_PATH="${APP_PATH}"

WORKDIR "${APP_PATH}"

RUN apt-get update -y \
    && apt-get upgrade -y -o APT::Keep-Downloaded-Packages=false \
    && apt-get install -y -o APT::Keep-Downloaded-Packages=false --no-install-recommends \
       curl \
       gnupg \
       jq \
       make \
       shellcheck \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV LANG=C.UTF-8 \
    LANGUAGE=C.UTF-8 \
    LC_ALL=C.UTF-8

# Install Docker CE CLI + Compose plugin from the official Docker apt repo
# (avoids moby packages which are unavailable on Debian trixie)
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg \
       | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
       https://download.docker.com/linux/debian \
       $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
       | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
     && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin docker-buildx-plugin \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Terraform via HashiCorp apt repo
RUN curl -fsSL https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(. /etc/os-release && echo "$VERSION_CODENAME") main" \
    > /etc/apt/sources.list.d/hashicorp.list \
    && apt-get update -y \
    && apt-get install -y --no-install-recommends terraform \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 24 (NodeSource) — match the frontend prod image (node:24-slim)
# and Next 16's Node >= 20.9 requirement. Debian's apt `nodejs` is older and
# splits out `npm`; NodeSource ships a current node + npm together.
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install uv for Python environment management and pre-commit for repo hooks
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"
RUN uv tool install pre-commit

# The image's Python: uv-managed 3.14, installed as the DEFAULT `python`/`python3`
# on PATH (--default). One interpreter for everything — the services
# (requires-python = "==3.14.*"), `uv sync`/`uv run`, and the lint tooling
# (pre-commit check-ast, mypy) — so all parse the same 3.14 syntax (incl. PEP 758).
# The google/cloud-sdk base keeps its own private Python for gcloud
# (CLOUDSDK_PYTHON), untouched.
RUN uv python install 3.14 --default
