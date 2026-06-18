FROM us-central1-docker.pkg.dev/database-toolbox/toolbox/toolbox:1.1.0 AS toolbox

FROM python:3.14-bookworm

COPY --from=toolbox /toolbox /usr/local/bin/toolbox

WORKDIR /workspace

EXPOSE 5000
