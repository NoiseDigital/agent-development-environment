"""Resolve a source reference into a cleaned DataFrame.

A source is a URI-style string identifying what to analyze:

  - upload:<uuid>                a user-uploaded file — looked up via the agent
                                 API, then read from the shared uploads volume.
  - bigquery:<dataset>.<table>   a live BigQuery table — read directly from
                                 BigQuery; large tables are randomly sampled.
"""

from __future__ import annotations

import os
from typing import Optional

import httpx
import pandas as pd

from engine import clean_dataframe

AGENT_URL = os.environ.get("AGENT_URL", "http://agent:8000")
STORAGE_PATH = os.environ.get("STORAGE_LOCAL_PATH", "/data/uploads")
BQ_PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT")

# BigQuery tables larger than this are randomly down-sampled — correlation and
# regression only need a representative sample, not the full table.
BQ_SAMPLE_CAP = 50_000


def load_source(source: str, sheet: Optional[str] = None) -> pd.DataFrame:
    """Resolve a source URI to a cleaned DataFrame."""
    scheme, _, rest = source.partition(":")
    if scheme == "upload":
        df = _read_upload(rest, sheet)
    elif scheme == "bigquery":
        dataset, _, table = rest.partition(".")
        if not dataset or not table:
            raise ValueError(
                f"Invalid BigQuery source '{source}' (expected bigquery:<dataset>.<table>)"
            )
        df = _read_bigquery(dataset, table)
    else:
        raise ValueError(
            f"Unknown source '{source}' — expected 'upload:<id>' or 'bigquery:<dataset>.<table>'"
        )
    return clean_dataframe(df)


def _read_upload(source_id: str, sheet: Optional[str]) -> pd.DataFrame:
    resp = httpx.get(f"{AGENT_URL}/api/sources/{source_id}", timeout=30.0)
    resp.raise_for_status()
    source = resp.json()
    path = os.path.join(STORAGE_PATH, source["storage_key"])
    ext = (source.get("file_ext") or "").lower()
    if ext in (".csv", ".txt"):
        return pd.read_csv(path, low_memory=False)
    engine = "pyxlsb" if ext == ".xlsb" else None
    return pd.read_excel(path, sheet_name=sheet or 0, engine=engine)


def _read_bigquery(dataset: str, table: str) -> pd.DataFrame:
    from google.cloud import bigquery

    client = bigquery.Client(project=BQ_PROJECT)
    fqn = f"`{BQ_PROJECT}`.`{dataset}`.`{table}`"

    row_count = client.query(f"SELECT COUNT(*) AS n FROM {fqn}").to_dataframe()["n"][0]
    if row_count > BQ_SAMPLE_CAP:
        # Deterministic hash sample — FARM_FINGERPRINT over each row gives a
        # stable, uniform bucket, so the same rows are drawn every run and a
        # correlation is reproducible (unlike RAND(), which varies per query).
        bucket = max(1, round(BQ_SAMPLE_CAP / row_count * 10_000))
        sql = (
            f"SELECT * FROM {fqn} AS t "
            f"WHERE MOD(ABS(FARM_FINGERPRINT(TO_JSON_STRING(t))), 10000) < {bucket} "
            f"LIMIT {BQ_SAMPLE_CAP}"
        )
    else:
        sql = f"SELECT * FROM {fqn}"
    return client.query(sql).to_dataframe()
