"""Deterministic statistics engine — correlation, regression, QA, profiling.

Ported from the AUTO-COR analysis notebook. Pure pandas/scipy/statsmodels:
no I/O, no UI. Callers resolve data sources and shape the output payloads.
"""

from __future__ import annotations

import math
import re
from typing import Any, Optional

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy.stats import pearsonr, spearmanr
from statsmodels.stats.stattools import durbin_watson

_EXCEL_ERRORS = r"^#(DIV/0!|N/A|VALUE!|NAME\?|NULL!|NUM!|REF!)$"


# ── JSON safety ──────────────────────────────────────────────────────────────


def _clean(value: Any) -> Any:
    """Recursively convert numpy scalars and NaN/Inf to JSON-safe values."""
    if isinstance(value, dict):
        return {k: _clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_clean(v) for v in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        f = float(value)
        return None if (math.isnan(f) or math.isinf(f)) else f
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if value is pd.NaT or (value is None):
        return None
    return value


# ── Loading / cleaning ───────────────────────────────────────────────────────


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize headers, null out Excel errors, coerce numeric & datetime columns."""
    df = df.copy()
    df.columns = [re.sub(r"\s+", " ", str(c)).strip() for c in df.columns]
    df.replace(to_replace=_EXCEL_ERRORS, value=np.nan, regex=True, inplace=True)

    for c in df.columns:
        s = df[c]
        if s.dtype == object:
            present = s.notna()
            if not present.any():
                continue
            cleaned = (
                s.astype(str)
                .str.strip()
                .str.replace(r"\(([^)]+)\)", r"-\1", regex=True)  # (123) -> -123
                .str.replace(r"[\$,]", "", regex=True)
                .str.replace("%", "", regex=True)
            )
            cand = pd.to_numeric(cleaned, errors="coerce")
            # Numeric when the values that ARE present parse — a sparse column
            # (many nulls, e.g. a rare BigQuery funnel metric) is still numeric.
            if cand[present].notna().mean() >= 0.80:
                df[c] = cand

    for c in df.select_dtypes(include=["object"]).columns:
        s = df[c]
        present = s.notna()
        if not present.any():
            continue
        dt = pd.to_datetime(s, errors="coerce")
        if dt[present].notna().mean() >= 0.80:
            df[c] = dt

    return df


def _numeric_columns(df: pd.DataFrame) -> list[str]:
    return list(df.select_dtypes(include=["number"]).columns)


def _is_datetime(dtype) -> bool:
    """True for numpy datetime64 and BigQuery date/time extension dtypes."""
    if pd.api.types.is_datetime64_any_dtype(dtype):
        return True
    name = str(dtype).lower()
    return "date" in name or "time" in name


# ── Preprocessing ────────────────────────────────────────────────────────────


def _winsorize(df: pd.DataFrame, ql: float = 0.01, qh: float = 0.99) -> pd.DataFrame:
    df = df.copy()
    for c in _numeric_columns(df):
        s = df[c]
        df[c] = s.clip(s.quantile(ql), s.quantile(qh))
    return df


def _log1p(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    for c in _numeric_columns(df):
        s = df[c]
        if not (s < 0).any():
            df[c] = np.log1p(s)
    return df


def _zscore(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    for c in _numeric_columns(df):
        s = df[c]
        std = s.std(ddof=0)
        if std and not np.isnan(std):
            df[c] = (s - s.mean()) / std
    return df


def _difference(
    df: pd.DataFrame, time_col: Optional[str], group_col: Optional[str]
) -> pd.DataFrame:
    df = df.copy()
    num = _numeric_columns(df)
    if not num:
        return df
    sort_cols = [c for c in (group_col, time_col) if c and c in df.columns]
    if sort_cols:
        df = df.sort_values(sort_cols)
    if group_col and group_col in df.columns:
        df[num] = df.groupby(group_col, group_keys=False)[num].diff()
    else:
        df[num] = df[num].diff()
    return df


def _lag(
    df: pd.DataFrame,
    cols: list[str],
    lag: int,
    time_col: Optional[str],
    group_col: Optional[str],
) -> pd.DataFrame:
    """Shift `cols` by `lag` periods, optionally within groups and time order."""
    cols = [c for c in cols if c in df.columns]
    if not cols or lag == 0:
        return df
    df = df.copy()
    if group_col and group_col in df.columns:
        if time_col and time_col in df.columns:
            df = df.sort_values([group_col, time_col])
        df[cols] = df.groupby(group_col, group_keys=False)[cols].shift(lag)
    else:
        if time_col and time_col in df.columns:
            df = df.sort_values(time_col)
        df[cols] = df[cols].shift(lag)
    return df


def preprocess(
    df: pd.DataFrame,
    winsorize: bool = False,
    log1p: bool = False,
    zscore: bool = False,
    difference: bool = False,
    time_col: Optional[str] = None,
    group_col: Optional[str] = None,
) -> pd.DataFrame:
    if winsorize:
        df = _winsorize(df)
    if log1p:
        df = _log1p(df)
    if zscore:
        df = _zscore(df)
    if difference:
        df = _difference(df, time_col, group_col)
    return df


# ── Correlation ──────────────────────────────────────────────────────────────


def _corr_pair(x: pd.Series, y: pd.Series, method: str) -> tuple[float, float]:
    fn = pearsonr if method == "pearson" else spearmanr
    r, p = fn(x, y)
    return float(r), float(p)


def correlate(
    df: pd.DataFrame,
    set_a: Optional[list[str]] = None,
    set_b: Optional[list[str]] = None,
    method: str = "pearson",
    alpha: float = 0.05,
    lag: int = 0,
    top_n: int = 20,
    winsorize: bool = False,
    log1p: bool = False,
    zscore: bool = False,
    difference: bool = False,
    group_col: str = "",
    group_val: str = "",
    time_col: str = "",
) -> dict:
    """Pearson/Spearman correlation between Set A and Set B (or an A×A matrix)."""
    method = "spearman" if method.lower().startswith("s") else "pearson"
    gcol = group_col or None
    tcol = time_col or None

    work = preprocess(df, winsorize, log1p, zscore, difference, tcol, gcol)
    numeric = _numeric_columns(work)
    sel_a = [c for c in (set_a or numeric) if c in numeric]
    sel_b = [c for c in (set_b or []) if c in numeric]

    if gcol and group_val and gcol in work.columns:
        work = work.loc[work[gcol].astype(str) == str(group_val)]

    if sel_b and lag != 0:
        work = _lag(work, sel_b, lag, tcol, gcol)

    # Correlation is computed pairwise — each pair drops its own nulls below —
    # so a sparse column never decimates the sample available to the others.
    a_cols = sel_a
    b_cols = sel_b if sel_b else sel_a

    matrix: list[list[Optional[float]]] = []
    pvalues: list[list[Optional[float]]] = []
    significant: list[list[bool]] = []
    signals: list[dict] = []

    for a in a_cols:
        row_r, row_p, row_sig = [], [], []
        for b in b_cols:
            if a == b and not sel_b:
                r, p = 1.0, 0.0
            else:
                pair = work[[a, b]].dropna()
                if len(pair) < 3:
                    r, p = float("nan"), float("nan")
                else:
                    r, p = _corr_pair(pair[a], pair[b], method)
            row_r.append(r)
            row_p.append(p)
            sig = (not math.isnan(p)) and p <= alpha
            row_sig.append(sig)
            if a != b and not math.isnan(r):
                signals.append({"a": a, "b": b, "r": r, "p": p, "abs_r": abs(r)})
        matrix.append(row_r)
        pvalues.append(row_p)
        significant.append(row_sig)

    signals.sort(key=lambda s: s["abs_r"], reverse=True)

    return _clean(
        {
            "method": method,
            "rows": a_cols,
            "cols": b_cols,
            "matrix": matrix,
            "pvalues": pvalues,
            "significant": significant,
            "top_signals": signals[: max(1, top_n)],
            "n_rows_used": int(len(work)),
            "params": {
                "alpha": alpha,
                "lag": lag,
                "top_n": top_n,
                "group_col": group_col,
                "group_val": group_val,
                "time_col": time_col,
                "preprocess": {
                    "winsorize": winsorize,
                    "log1p": log1p,
                    "zscore": zscore,
                    "difference": difference,
                },
            },
        }
    )


# ── Regression ───────────────────────────────────────────────────────────────


def regress(
    df: pd.DataFrame,
    y: str,
    x: list[str],
    add_constant: bool = True,
    zscore: bool = False,
    difference: bool = False,
    lag: int = 0,
    group_col: str = "",
    group_val: str = "",
    time_col: str = "",
) -> dict:
    """Ordinary least squares regression of `y` on `x`."""
    if not y or not x:
        raise ValueError("Regression needs a Y column and at least one X column.")
    gcol = group_col or None
    tcol = time_col or None

    work = preprocess(
        df, zscore=zscore, difference=difference, time_col=tcol, group_col=gcol
    )
    if lag != 0:
        work = _lag(work, list(x), lag, tcol, gcol)
    if gcol and group_val and gcol in work.columns:
        work = work.loc[work[gcol].astype(str) == str(group_val)]

    cols = [y] + list(x)
    work = work[cols].dropna()
    if work.empty:
        raise ValueError("No rows remain after preprocessing / dropping nulls.")

    y_vec = work[y].astype(float)
    x_mat = work[list(x)].astype(float)
    if add_constant:
        x_mat = sm.add_constant(x_mat, has_constant="add")

    model = sm.OLS(y_vec, x_mat, missing="drop").fit()
    conf = model.conf_int()  # 95% CI per coefficient (cols 0/1 = lower/upper)
    coefficients = [
        {
            "term": term,
            "coef": model.params.get(term),
            "std_err": model.bse.get(term),
            "t": model.tvalues.get(term),
            "p_value": model.pvalues.get(term),
            "ci_low": conf.loc[term, 0],
            "ci_high": conf.loc[term, 1],
        }
        for term in model.params.index
    ]
    predicted = model.fittedvalues.tolist()
    actual = y_vec.tolist()

    return _clean(
        {
            "y": y,
            "x": list(x),
            "n_obs": int(model.nobs),
            "r_squared": model.rsquared,
            "adj_r_squared": model.rsquared_adj,
            "f_pvalue": model.f_pvalue,
            "coefficients": coefficients,
            # Residual diagnostics — Durbin-Watson (autocorrelation: ~2 is clean,
            # <1 or >3 flags it), condition number (multicollinearity: >30 is a
            # warning, >1000 severe), and AIC/BIC for model comparison.
            "diagnostics": {
                "durbin_watson": float(durbin_watson(model.resid)),
                "condition_number": float(model.condition_number),
                "aic": float(model.aic),
                "bic": float(model.bic),
            },
            "fit_points": [
                {"actual": a, "predicted": p} for a, p in zip(actual, predicted)
            ],
        }
    )


# ── QA & profiling ───────────────────────────────────────────────────────────


def qa_report(df: pd.DataFrame, time_col: str = "") -> dict:
    """Data-quality screen — surfaces issues that would distort correlation."""
    msgs: list[str] = []
    work = df.copy()

    obj_cols = work.select_dtypes(include=["object", "string"]).columns
    for c in obj_cols:
        work[c] = work[c].map(
            lambda x: np.nan if (isinstance(x, str) and x.strip() == "") else x
        )

    dupes = work.columns[work.columns.duplicated()].tolist()
    if dupes:
        msgs.append(f"Duplicate column names detected: {', '.join(dupes)}.")

    num_cols = _numeric_columns(work)
    if len(num_cols) < 2:
        msgs.append("Fewer than two numeric columns — not enough for correlation.")

    if time_col and time_col in work.columns and work[time_col].dtype == object:
        rate = pd.to_datetime(work[time_col], errors="coerce").notna().mean()
        if rate < 0.8:
            msgs.append(f"Time column '{time_col}' has inconsistent date formats.")

    for c in num_cols:
        s = pd.to_numeric(work[c], errors="coerce")
        if s.isna().mean() > 0.5:
            msgs.append(f"High missingness (>50%) in '{c}'.")
        denom = s.notna().sum()
        if denom and (s == 0).sum() / denom > 0.5:
            msgs.append(f"High zero share (>50%) in '{c}' — check for DIV/0 or blanks.")
        if s.nunique(dropna=True) <= 1:
            msgs.append(f"Constant column '{c}' — cannot correlate.")

    return _clean(
        {
            "ok": len(msgs) == 0,
            "warnings": msgs,
            "row_count": int(len(df)),
            "column_count": int(len(df.columns)),
        }
    )


def describe(df: pd.DataFrame) -> dict:
    """Column inventory with dtype classification — drives Set A/B pickers."""
    columns = []
    for c in df.columns:
        s = df[c]
        # pandas type helpers tolerate extension dtypes (BigQuery date/numeric);
        # np.issubdtype would raise on them.
        if _is_datetime(s.dtype):
            kind = "datetime"
        elif pd.api.types.is_numeric_dtype(s) and not pd.api.types.is_bool_dtype(s):
            kind = "numeric"
        else:
            kind = "categorical"
        col = {
            "name": str(c),
            "kind": kind,
            "missing_pct": round(float(s.isna().mean() * 100), 2),
        }
        # For LOW-cardinality categoricals (segment columns like channel/market),
        # expose the distinct values so the UI can offer a "segment by value"
        # picker. Skip high-cardinality / free-text columns.
        if kind == "categorical":
            vc = s.dropna().astype(str).value_counts()
            if 0 < len(vc) <= 200:
                col["values"] = [str(v) for v in vc.index[:50].tolist()]
        columns.append(col)
    return _clean(
        {
            "row_count": int(len(df)),
            "columns": columns,
            "numeric_columns": _numeric_columns(df),
        }
    )


def profile(df: pd.DataFrame) -> dict:
    """Robust per-numeric-column distribution stats — surfaces skew + outliers
    that inform method (Spearman) and preprocessing (log1p/winsorize) choices."""
    out = []
    for c in _numeric_columns(df):
        s = pd.to_numeric(df[c], errors="coerce")
        nn = s.dropna()
        if nn.empty:
            continue
        out.append(
            {
                "name": str(c),
                "missing_pct": round(float(s.isna().mean() * 100), 2),
                "min": float(nn.min()),
                "p01": float(nn.quantile(0.01)),
                "median": float(nn.median()),
                "p99": float(nn.quantile(0.99)),
                "max": float(nn.max()),
                "mean": float(nn.mean()),
                "std": float(nn.std(ddof=0)),
                "skew": float(nn.skew()) if len(nn) > 2 else 0.0,
            }
        )
    return _clean({"columns": out})


def pairs(
    df: pd.DataFrame,
    a: str,
    b: str,
    method: str = "pearson",
    lag: int = 0,
    winsorize: bool = False,
    log1p: bool = False,
    zscore: bool = False,
    difference: bool = False,
    group_col: str = "",
    group_val: str = "",
    time_col: str = "",
    max_points: int = 2000,
) -> dict:
    """The (x, y) points for ONE column pair, after the SAME preprocessing as
    correlate — for the scatter explorer. Downsampled to max_points for render."""
    method = "spearman" if method.lower().startswith("s") else "pearson"
    gcol = group_col or None
    tcol = time_col or None
    work = preprocess(df, winsorize, log1p, zscore, difference, tcol, gcol)
    numeric = _numeric_columns(work)
    if a not in numeric or b not in numeric:
        return {"a": a, "b": b, "error": "both columns must be numeric"}
    if gcol and group_val and gcol in work.columns:
        work = work.loc[work[gcol].astype(str) == str(group_val)]
    if lag != 0:
        work = _lag(work, [b], lag, tcol, gcol)
    pair = work[[a, b]].dropna()
    if len(pair) < 3:
        return {"a": a, "b": b, "n": int(len(pair)), "r": None, "p": None, "points": []}
    r, p = _corr_pair(pair[a], pair[b], method)
    if len(pair) > max_points:
        pair = pair.sample(max_points, random_state=0)
    points = [{"x": float(xv), "y": float(yv)} for xv, yv in zip(pair[a], pair[b])]
    return _clean(
        {
            "a": a,
            "b": b,
            "method": method,
            "n": int(len(points)),
            "r": r,
            "p": p,
            "points": points,
        }
    )
