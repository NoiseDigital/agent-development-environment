"""Competitive Media Intelligence Estimator.

Turns competitive ad-spend exports (MediaRadar / Pathmatics) into directional
spend estimates, share-of-voice, and model-support ("confidence") scoring. Ported
from the Colab demo; all math is deterministic pandas/numpy. The frontend renders
the returned tables as charts; narration comes from the market_radar_insights_agent.

Input schema (columns, case/space-insensitive):
  brand (req) · spend (req) · source (req) · market (opt → "Total Market") ·
  channel | partner|publisher|vendor|platform|network|site (opt) · impressions (opt)
"""

from __future__ import annotations

import math
from typing import Optional

import numpy as np
import pandas as pd
from scipy.stats import t as student_t

# ── Channel normalization ─────────────────────────────────────────────────────
# Raw channel/partner strings collapse to a small set of canonical buckets, each
# with an "expansion weight" (advanced mode grosses observed spend up by it to
# account for coverage gaps that vary by channel).
_CHANNEL_CANON: dict[str, list[str]] = {
    "search": ["search", "sem", "paid search", "google ads", "search ads", "ppc"],
    "social": [
        "social",
        "facebook",
        "meta",
        "instagram",
        "tiktok",
        "snapchat",
        "twitter",
        "x",
        "linkedin",
        "pinterest",
        "reddit",
    ],
    "display": ["display", "banner", "programmatic", "gdn", "dsp"],
    "video": ["video", "youtube", "online video", "olv", "pre-roll", "preroll"],
    "ctv": ["ctv", "connected tv", "ott", "hulu", "roku", "streaming tv"],
    "tv": ["tv", "linear tv", "television", "broadcast", "cable"],
    "audio": ["audio", "podcast", "spotify", "radio", "streaming audio"],
    "ooh": ["ooh", "out of home", "outdoor", "billboard", "dooh", "transit"],
    "print": ["print", "magazine", "newspaper"],
    "email": ["email", "edm", "newsletter"],
    "native": ["native", "sponsored content", "advertorial"],
    "retail_media": ["retail media", "amazon", "rmn", "commerce", "sponsored products"],
    "affiliate": ["affiliate", "partnership"],
    "direct_mail": ["direct mail", "mail"],
}
_CHANNEL_LOOKUP = {
    a: canon for canon, aliases in _CHANNEL_CANON.items() for a in aliases
}
_CHANNEL_EXPANSION = {
    "search": 1.4,
    "social": 1.8,
    "display": 1.5,
    "video": 2.0,
    "ctv": 2.3,
    "tv": 1.5,
    "audio": 1.6,
    "ooh": 1.7,
    "print": 1.3,
    "email": 1.2,
    "native": 1.5,
    "retail_media": 1.9,
    "affiliate": 1.4,
    "direct_mail": 1.3,
    "other": 1.4,
}

_REQUIRED = ["brand", "spend", "source"]
_PARTNER_ALIASES = ["partner", "publisher", "vendor", "platform", "network", "site"]


def _normalize_channel(val) -> str:
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return "other"
    s = str(val).strip().lower()
    if not s:
        return "other"
    if s in _CHANNEL_LOOKUP:
        return _CHANNEL_LOOKUP[s]
    for alias, canon in _CHANNEL_LOOKUP.items():
        if alias in s:
            return canon
    return "other"


def _to_num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(
        s.astype(str)
        .str.replace(r"[$,%)]", "", regex=True)
        .str.replace("(", "-", regex=False)
        .str.strip(),
        errors="coerce",
    )


def _jsonable(o):
    """Recursively convert numpy types + NaN so JSONResponse can serialize."""
    if isinstance(o, dict):
        return {k: _jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_jsonable(v) for v in o]
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.floating):
        f = float(o)
        return None if math.isnan(f) else f
    if isinstance(o, float):
        return None if math.isnan(o) else o
    return o


def _prep(
    df: pd.DataFrame, dimension: str = "auto", scope: str = "market"
) -> tuple[pd.DataFrame, list[str]]:
    """Clean + validate + derive market / channel / partner / media-group columns.

    dimension: which media grouping advanced mode estimates over —
      auto | channel | partner | channel_partner.
    scope: 'total' collapses everything into one "Total Market".
    """
    warnings: list[str] = []
    df = df.copy()
    df.columns = [str(c).strip().lower().replace(" ", "_") for c in df.columns]

    missing = [c for c in _REQUIRED if c not in df.columns]
    if missing:
        raise ValueError(
            f"Missing required column(s): {', '.join(missing)} (need brand, spend, source)."
        )

    df["spend"] = _to_num(df["spend"]).fillna(0.0)
    df["brand"] = df["brand"].astype(str).str.strip()
    df["source"] = df["source"].astype(str).str.strip()

    if scope == "total":
        df["market"] = "Total Market"
    elif "market" in df.columns:
        df["market"] = df["market"].astype(str).str.strip()
        df.loc[df["market"].isin(["", "nan", "none", "None"]), "market"] = (
            "Total Market"
        )
    else:
        df["market"] = "Total Market"
        warnings.append("No 'market' column — analyzing as a single Total Market.")

    if "impressions" in df.columns:
        df["impressions"] = _to_num(df["impressions"]).fillna(0.0)

    # Channel drives expansion weights; partner is the alternative media grouping.
    has_channel = "channel" in df.columns
    df["channel_norm"] = (
        df["channel"].map(_normalize_channel) if has_channel else "other"
    )
    partner_col = next((a for a in _PARTNER_ALIASES if a in df.columns), None)
    if partner_col:
        df["partner_norm"] = (
            df[partner_col]
            .astype(str)
            .str.strip()
            .replace({"": "(unknown)", "nan": "(unknown)"})
        )
    else:
        df["partner_norm"] = "(unknown)"

    dim = str(dimension).lower()
    if dim == "channel":
        df["media_norm"] = df["channel_norm"]
    elif dim == "partner":
        df["media_norm"] = df["partner_norm"]
    elif dim in ("channel_partner", "channel+partner"):
        df["media_norm"] = (
            df["channel_norm"].astype(str) + " | " + df["partner_norm"].astype(str)
        )
    else:  # auto — channel if present, else partner, else a single bucket
        df["media_norm"] = (
            df["channel_norm"]
            if has_channel
            else (df["partner_norm"] if partner_col else "other")
        )

    if not has_channel and not partner_col:
        warnings.append(
            "No channel/partner column — advanced estimates use a single media bucket."
        )
    if df["spend"].sum() <= 0:
        warnings.append(
            "Observed spend sums to zero — check the spend column formatting."
        )
    return df, warnings


def calculate_sov(df: pd.DataFrame) -> pd.DataFrame:
    """Spend (and impression) share-of-voice per brand within each market."""
    has_impr = "impressions" in df.columns
    agg = {"observed_spend": ("spend", "sum")}
    if has_impr:
        agg["observed_impressions"] = ("impressions", "sum")
    g = df.groupby(["market", "brand"], as_index=False).agg(**agg)
    g = g.merge(df.groupby("market")["spend"].sum().rename("market_spend"), on="market")
    g["spend_sov"] = np.where(
        g["market_spend"] > 0, g["observed_spend"] / g["market_spend"], 0.0
    )
    if has_impr:
        g = g.merge(
            df.groupby("market")["impressions"].sum().rename("market_impr"), on="market"
        )
        g["impression_sov"] = np.where(
            g["market_impr"] > 0, g["observed_impressions"] / g["market_impr"], 0.0
        )
    return g


def _confidence(
    source_count: int, channel_count: int, record_count: int
) -> tuple[float, str]:
    """Model-support score: a weighted DATA-COVERAGE score (not a statistical CI)."""
    score = (
        min(source_count / 2, 1) * 0.40
        + min(channel_count / 4, 1) * 0.35
        + min(record_count / 25, 1) * 0.25
    )
    band = "High" if score >= 0.7 else "Moderate" if score >= 0.4 else "Low"
    return round(float(score), 3), band


def _estimate(
    df: pd.DataFrame,
    mode: str,
    maturity: Optional[dict],
    dimension: str = "auto",
    scope: str = "market",
) -> tuple[pd.DataFrame, pd.DataFrame, str, list[str]]:
    """Prep + per brand/market estimation. Shared by run() and forecast()."""
    df, warnings = _prep(df, dimension, scope)
    mode = "advanced" if str(mode).lower().startswith("a") else "basic"
    maturity = maturity or {}

    rows: list[dict] = []
    for (market, brand), grp in df.groupby(["market", "brand"]):
        observed = float(grp["spend"].sum())
        mw = float(maturity.get(market, 1.0))
        source_count = int(grp["source"].nunique())
        channel_count = int(grp["channel_norm"].nunique())
        record_count = int(len(grp))
        if mode == "advanced":
            base = 0.0
            # Expand each media group (channel / partner / both) separately; the
            # expansion factor stays channel-derived (spend-weighted within group).
            for _, cg in grp.groupby("media_norm"):
                spend = cg["spend"].to_numpy(float)
                tot = float(spend.sum())
                exp = (
                    cg["channel_norm"]
                    .map(
                        lambda c: _CHANNEL_EXPANSION.get(c, _CHANNEL_EXPANSION["other"])
                    )
                    .to_numpy(float)
                )
                ce = float((exp * spend).sum() / tot) if tot > 0 else float(exp.mean())
                scov = 1.10 if cg["source"].nunique() >= 2 else 0.95
                rdepth = float(np.clip(len(cg) / 10, 0.75, 1.05))
                base += tot * ce * mw * scov * rdepth
            low, high = base * 0.65, base * 1.55
        else:
            base = observed * mw * 1.75
            low, high = base * 0.75, base * 1.35
        score, band = _confidence(source_count, channel_count, record_count)
        rows.append(
            {
                "market": market,
                "brand": brand,
                "observed_spend": observed,
                "estimated_base": base,
                "estimated_low": low,
                "estimated_high": high,
                "confidence": score,
                "support_band": band,
                "source_count": source_count,
                "channel_count": channel_count,
                "record_count": record_count,
            }
        )
    return df, pd.DataFrame(rows), mode, warnings


def _rule_based_insights(est: pd.DataFrame) -> list[dict]:
    """Deterministic headline reads — shown immediately, before any LLM narration."""
    out: list[dict] = []
    if not est.empty:
        top_m = est.groupby("market")["estimated_base"].sum().idxmax()
        out.append(
            {
                "type": "Market Intensity",
                "text": f"{top_m} shows the highest estimated competitive spend, suggesting it "
                "may be the most active battleground.",
            }
        )
        top_b = est.groupby("brand")["estimated_base"].sum().idxmax()
        out.append(
            {
                "type": "Brand Leader",
                "text": f"{top_b} appears to be the highest-spending competitor based on modeled "
                "base estimates.",
            }
        )
        low = int((est["support_band"] == "Low").sum())
        if low > 0:
            out.append(
                {
                    "type": "Model Support Watchout",
                    "text": f"{low} brand-market combinations have low model support due to limited "
                    "source coverage, fewer channels, or sparse records.",
                }
            )
    out.append(
        {
            "type": "Strategic Read",
            "text": "Use the base estimate for directional planning, the low/high range for "
            "sensitivity, and model-support labels to find where validation is needed.",
        }
    )
    return out


def run(
    df: pd.DataFrame,
    mode: str = "basic",
    maturity: Optional[dict] = None,
    dimension: str = "auto",
    scope: str = "market",
) -> dict:
    """Full estimator pass → the dashboard's data (KPIs, by-market, SOV, support…)."""
    df, est, mode, warnings = _estimate(df, mode, maturity, dimension, scope)
    sov = calculate_sov(df)
    if est.empty:
        return _jsonable(
            {
                "kpis": {},
                "mode": mode,
                "warnings": warnings + ["No estimable brand/market rows."],
            }
        )

    by_market = (
        est.groupby("market", as_index=False)
        .agg(
            observed=("observed_spend", "sum"),
            base=("estimated_base", "sum"),
            low=("estimated_low", "sum"),
            high=("estimated_high", "sum"),
            competitors=("brand", "nunique"),
            support=("confidence", "mean"),
        )
        .sort_values("base", ascending=False)
    )

    by_brand = (
        est.groupby("brand", as_index=False)
        .agg(
            observed_spend=("observed_spend", "sum"),
            estimated_base=("estimated_base", "sum"),
        )
        .sort_values("estimated_base", ascending=False)
    )

    sd = (
        est.assign(n=1)
        .groupby(["market", "support_band"])["n"]
        .sum()
        .unstack(fill_value=0)
    )
    for b in ("Low", "Moderate", "High"):
        if b not in sd.columns:
            sd[b] = 0
    support_distribution = sd.reset_index()[
        ["market", "Low", "Moderate", "High"]
    ].to_dict("records")

    kpis = {
        "observed_spend": float(est["observed_spend"].sum()),
        "estimated_base": float(est["estimated_base"].sum()),
        "estimated_low": float(est["estimated_low"].sum()),
        "estimated_high": float(est["estimated_high"].sum()),
        "model_support_score": round(float(est["confidence"].mean()), 3),
        "brands": int(est["brand"].nunique()),
        "markets": int(est["market"].nunique()),
    }

    return _jsonable(
        {
            "kpis": kpis,
            "mode": mode,
            "by_market": by_market.to_dict("records"),
            "by_brand": by_brand.head(10).to_dict("records"),
            "sov": sov.sort_values("spend_sov", ascending=False).to_dict("records"),
            "brand_within_market": est[["market", "brand", "estimated_base"]].to_dict(
                "records"
            ),
            "support_distribution": support_distribution,
            "observed_vs_estimated": est[
                ["brand", "market", "observed_spend", "estimated_base", "confidence"]
            ].to_dict("records"),
            "top_combinations": est.sort_values("estimated_base", ascending=False)
            .head(15)[["brand", "market", "estimated_base", "support_band"]]
            .to_dict("records"),
            "markets_list": sorted(est["market"].unique().tolist()),
            "insights": _rule_based_insights(est),
            "warnings": warnings,
        }
    )


# ══════════════════════════════════════════════════════════════════════════════
# Scenario Planner — forecast competitive spend forward from a modeled history.
# Two views: (1) the total landscape (one OLS trend + prediction-interval fan),
# and (2) per-brand trajectories (top 8 brands, spend / impressions / SOV).
# ══════════════════════════════════════════════════════════════════════════════

# (alpha_level, label) for the 80/85/90/95% prediction-interval fan bands.
_BAND_LEVELS = [(0.20, 80), (0.15, 85), (0.10, 90), (0.05, 95)]
_DATE_ALIASES = [
    "date",
    "month",
    "week",
    "day",
    "period",
    "timestamp",
    "time",
    "reporting_date",
    "activity_date",
    "date_month",
]


def _iso(m) -> str:
    return pd.Timestamp(m).strftime("%Y-%m-%d")


def _month_series(df: pd.DataFrame) -> Optional[pd.Series]:
    """Find a date-like column and snap it to the first of each month. None if absent."""
    col = next((c for c in _DATE_ALIASES if c in df.columns), None)
    if col is None:
        return None
    parsed = pd.to_datetime(df[col], errors="coerce")
    if parsed.isna().all():
        return None
    return parsed.dt.to_period("M").dt.to_timestamp()


def build_scenario_history(clean: pd.DataFrame, est: pd.DataFrame) -> pd.DataFrame:
    """Monthly observed spend lifted onto the modeled scale by one global factor."""
    monthly = (
        clean.groupby("month", as_index=False)
        .agg(observed_spend=("spend", "sum"))
        .sort_values("month")
        .reset_index(drop=True)
    )
    total_obs = float(est["observed_spend"].sum())
    total_est = float(est["estimated_base"].sum())
    scale = total_est / total_obs if total_obs > 0 else 1.0
    monthly["estimated_base_spend"] = monthly["observed_spend"] * scale
    return monthly


def build_regression_forecast(
    history: pd.DataFrame,
    periods: int,
    growth_rate: float,
    scenario_multiplier: float,
    alpha: float,
    range_width: float,
    method: str,
) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """Closed-form OLS trend + per-step prediction intervals (fan bands)."""
    hist = history.copy().reset_index(drop=True)
    hist["t"] = np.arange(len(hist), dtype=float)
    hist["scenario_base_spend"] = hist["estimated_base_spend"] * scenario_multiplier
    y = hist["scenario_base_spend"].to_numpy(float)
    x = hist["t"].to_numpy(float)
    n = len(hist)
    last_month = hist["month"].iloc[-1]
    last_value = float(hist["scenario_base_spend"].iloc[-1])
    future: list[dict] = []

    # Fallback: too few points / no variance → carry forward with widening bands.
    if n < 3 or np.var(x) == 0:
        for step in range(1, periods + 1):
            central = (
                last_value
                if method == "trend_only"
                else last_value * (1 + growth_rate) ** step
            )
            central = max(central, 0.0)
            row = {
                "month": last_month + pd.DateOffset(months=step),
                "central_forecast": central,
            }
            for al, lbl in _BAND_LEVELS:
                bu = min(
                    0.90, (0.12 + 0.030 * step) * range_width * (0.20 / al) ** 0.35
                )
                row[f"ci_low_{lbl}"] = max(central * (1 - bu), 0.0)
                row[f"ci_high_{lbl}"] = central * (1 + bu)
            bu = min(0.90, (0.12 + 0.030 * step) * range_width * (0.20 / alpha) ** 0.35)
            row["ci_low"] = max(central * (1 - bu), 0.0)
            row["ci_high"] = central * (1 + bu)
            future.append(row)
        stats = {
            "method": "fallback",
            "slope": None,
            "intercept": None,
            "p_value": None,
            "r_squared": None,
            "n_months": n,
            "forecast_method": method,
        }
        return hist, pd.DataFrame(future), stats

    # Closed-form simple linear regression.
    xm, ym = x.mean(), y.mean()
    sxx = float(np.sum((x - xm) ** 2))
    slope = float(np.sum((x - xm) * (y - ym)) / sxx)
    intercept = float(ym - slope * xm)
    resid = y - (intercept + slope * x)
    dof = max(n - 2, 1)
    sse = float(np.sum(resid**2))
    se_reg = float(np.sqrt(sse / dof))
    ss_tot = float(np.sum((y - ym) ** 2))
    r_squared = (1 - sse / ss_tot) if ss_tot > 0 else None
    se_slope = se_reg / np.sqrt(sxx) if sxx > 0 else 0.0
    t_stat = slope / se_slope if se_slope > 0 else 0.0
    p_value = float(2 * (1 - student_t.cdf(abs(t_stat), df=dof)))

    for step in range(1, periods + 1):
        x_new = float(n - 1 + step)
        reg_pred = intercept + slope * x_new
        if method == "trend_only":
            central = max(0.0, reg_pred)
        elif method == "trend_plus_scenario":
            central = max(0.0, reg_pred * (1 + growth_rate) ** step)
        else:  # scenario_override
            central = max(0.0, last_value * (1 + growth_rate) ** step)
        pred_se = se_reg * np.sqrt(1 + 1 / n + (x_new - xm) ** 2 / sxx)
        row = {
            "month": last_month + pd.DateOffset(months=step),
            "central_forecast": central,
        }
        margin = float(student_t.ppf(1 - alpha / 2, df=dof)) * pred_se * range_width
        row["ci_low"] = max(0.0, central - margin)
        row["ci_high"] = central + margin
        for al, lbl in _BAND_LEVELS:
            mb = float(student_t.ppf(1 - al / 2, df=dof)) * pred_se * range_width
            row[f"ci_low_{lbl}"] = max(0.0, central - mb)
            row[f"ci_high_{lbl}"] = central + mb
        future.append(row)

    stats = {
        "method": "regression",
        "slope": slope,
        "intercept": intercept,
        "p_value": p_value,
        "r_squared": r_squared,
        "n_months": n,
        "forecast_method": method,
    }
    return hist, pd.DataFrame(future), stats


def calculate_forecast_reliability(
    model_support: float, stats: dict, periods: int
) -> tuple[float, str]:
    """Blend model-support, fit quality, significance, and horizon into a 0–1 score."""
    r2 = stats.get("r_squared")
    p = stats.get("p_value")
    r2c = 0.0 if r2 is None else float(np.clip(r2, 0, 1))
    pc = 0.50 if p is None else float(np.clip(1 - min(p / 0.20, 1), 0, 1))
    hc = float(np.clip(1 - periods / 36, 0.25, 1))
    rel = (
        0.45 * float(np.clip(model_support, 0, 1)) + 0.30 * r2c + 0.15 * pc + 0.10 * hc
    )
    label = "High" if rel >= 0.75 else "Moderate" if rel >= 0.50 else "Low"
    return round(float(rel), 3), label


def _linear_forecast_with_quality(
    values: np.ndarray,
    periods: int,
    growth_pct: float,
    method: str,
    range_width: float,
    uncertainty_sensitivity: float,
    last_month,
) -> tuple[pd.DataFrame, dict]:
    """Per-series forecaster — residual-std interval that widens with sqrt(step)."""
    y = np.asarray(values, dtype=float)
    n = len(y)
    x = np.arange(n, dtype=float)
    if n >= 3 and np.nanstd(y) > 0:
        slope, intercept = (float(v) for v in np.polyfit(x, y, 1))
        resid = y - (intercept + slope * x)
        ss_res = float(np.nansum(resid**2))
        ss_tot = float(np.nansum((y - np.nanmean(y)) ** 2))
        r2 = (1 - ss_res / ss_tot) if ss_tot > 0 else None
        sxx = float(np.sum((x - x.mean()) ** 2))
        slope_se = np.sqrt((ss_res / max(n - 2, 1)) / sxx) if sxx > 0 else 0.0
        p = (
            float(2 * (1 - student_t.cdf(abs(slope / slope_se), df=max(n - 2, 1))))
            if slope_se > 0
            else None
        )
        residual_std = max(float(np.nanstd(resid)), float(np.nanmean(y)) * 0.10, 1.0)
    else:
        slope, intercept, r2, p = 0.0, float(np.nanmean(y)), None, None
        residual_std = max(float(np.nanmean(y)) * 0.10, 1.0)

    last_value = float(y[-1])
    rows: list[dict] = []
    for step in range(1, periods + 1):
        reg_pred = intercept + slope * (n - 1 + step)
        if method == "trend_only":
            central = max(reg_pred, 0.0)
        elif method == "trend_plus_scenario":
            central = max(reg_pred * (1 + growth_pct / 100) ** step, 0.0)
        else:
            central = max(last_value * (1 + growth_pct / 100) ** step, 0.0)
        row = {
            "month": last_month + pd.DateOffset(months=step),
            "central_forecast": central,
        }
        for cl, lbl in [(0.80, 80), (0.85, 85), (0.90, 90), (0.95, 95)]:
            z = float(student_t.ppf((1 + cl) / 2, df=max(n - 2, 1))) if n > 2 else 1.96
            margin = (
                z * residual_std * np.sqrt(step) * uncertainty_sensitivity * range_width
            )
            row[f"ci_low_{lbl}"] = max(central - margin, 0.0)
            row[f"ci_high_{lbl}"] = max(central + margin, 0.0)
        rows.append(row)
    return pd.DataFrame(rows), {"r_squared": r2, "p_value": p, "slope": slope, "n": n}


def _brand_summary(
    brand: str,
    metric: str,
    hist_df: pd.DataFrame,
    fc: pd.DataFrame,
    stats: dict,
    min_periods: int,
    min_r2: float,
    max_p: float,
    is_pct: bool,
) -> dict:
    """Shape one brand×metric trajectory + a Supported/Directional quality gate."""
    n = len(hist_df)
    current = float(hist_df["value"].iloc[-1]) if n else 0.0
    end = float(fc["central_forecast"].iloc[-1]) if len(fc) else current
    change = (end - current) / current if current else 0.0
    r2, p = stats.get("r_squared"), stats.get("p_value")
    supported = (
        n >= min_periods and (r2 is None or r2 >= min_r2) and (p is None or p <= max_p)
    )
    fc_out = fc.copy()
    fc_out["month"] = fc_out["month"].map(_iso)
    return {
        "brand": brand,
        "metric": metric,
        "quality": "Supported" if supported else "Directional",
        "r_squared": r2,
        "p_value": p,
        "is_pct": is_pct,
        "current": current,
        "forecast_end": end,
        "change_pct": change,
        "historical_periods": n,
        "history": [
            {"month": _iso(m), "value": float(v)}
            for m, v in zip(hist_df["month"], hist_df["value"])
        ],
        "forecast": fc_out.to_dict("records"),
    }


def build_brand_level_forecasts(
    clean: pd.DataFrame,
    periods: int,
    growth_pct: float,
    method: str,
    range_width: float,
    uncertainty_sensitivity: float,
    metrics: list[str],
    min_periods: int,
    min_r2: float,
    max_p: float,
) -> list[dict]:
    """Forecast the top-8 brands' spend (+ impressions, + derived SOV)."""
    has_impr = "impressions" in clean.columns
    agg: dict = {"spend": ("spend", "sum")}
    if has_impr:
        agg["impressions"] = ("impressions", "sum")
    monthly = (
        clean.groupby(["brand", "month"], as_index=False)
        .agg(**agg)
        .sort_values("month")
    )
    top = list(
        monthly.groupby("brand")["spend"]
        .sum()
        .sort_values(ascending=False)
        .head(8)
        .index
    )

    out: list[dict] = []
    spend_fc: dict[str, pd.DataFrame] = {}
    for brand in top:
        bh = monthly[monthly["brand"] == brand].sort_values("month")
        last_month = bh["month"].iloc[-1]
        fc, st = _linear_forecast_with_quality(
            bh["spend"].to_numpy(float),
            periods,
            growth_pct,
            method,
            range_width,
            uncertainty_sensitivity,
            last_month,
        )
        spend_fc[brand] = fc.assign(brand=brand)
        if "spend" in metrics:
            out.append(
                _brand_summary(
                    brand,
                    "spend",
                    bh.rename(columns={"spend": "value"})[["month", "value"]],
                    fc,
                    st,
                    min_periods,
                    min_r2,
                    max_p,
                    is_pct=False,
                )
            )
        if "impressions" in metrics and has_impr:
            ifc, ist = _linear_forecast_with_quality(
                bh["impressions"].to_numpy(float),
                periods,
                growth_pct,
                method,
                range_width,
                uncertainty_sensitivity,
                last_month,
            )
            out.append(
                _brand_summary(
                    brand,
                    "impressions",
                    bh.rename(columns={"impressions": "value"})[["month", "value"]],
                    ifc,
                    ist,
                    min_periods,
                    min_r2,
                    max_p,
                    is_pct=False,
                )
            )

    # SOV is derived from the spend forecasts (share among the tracked top brands).
    if "sov" in metrics and spend_fc:
        comb = pd.concat(spend_fc.values(), ignore_index=True)
        tot_c = comb.groupby("month")["central_forecast"].transform("sum")
        comb["sov_central"] = np.where(tot_c > 0, comb["central_forecast"] / tot_c, 0.0)
        for lvl in (80, 85, 90, 95):
            tot_lo = comb.groupby("month")[f"ci_low_{lvl}"].transform("sum")
            tot_hi = comb.groupby("month")[f"ci_high_{lvl}"].transform("sum")
            comb[f"sov_low_{lvl}"] = np.where(
                tot_hi > 0, comb[f"ci_low_{lvl}"] / tot_hi, 0.0
            )
            comb[f"sov_high_{lvl}"] = np.where(
                tot_lo > 0, comb[f"ci_high_{lvl}"] / tot_lo, 0.0
            )
        month_tot_hist = (
            monthly[monthly["brand"].isin(top)]
            .groupby("month")["spend"]
            .transform("sum")
        )
        sov_hist = monthly[monthly["brand"].isin(top)].assign(
            value=lambda d: np.where(
                month_tot_hist > 0, d["spend"] / month_tot_hist, 0.0
            )
        )
        for brand in top:
            sub = comb[comb["brand"] == brand].sort_values("month")
            sfc = pd.DataFrame(
                {
                    "month": sub["month"].values,
                    "central_forecast": sub["sov_central"].clip(0, 1).values,
                }
            )
            for lvl in (80, 85, 90, 95):
                sfc[f"ci_low_{lvl}"] = sub[f"sov_low_{lvl}"].clip(0, 1).values
                sfc[f"ci_high_{lvl}"] = sub[f"sov_high_{lvl}"].clip(0, 1).values
            bh = sov_hist[sov_hist["brand"] == brand][["month", "value"]].sort_values(
                "month"
            )
            out.append(
                _brand_summary(
                    brand,
                    "sov",
                    bh,
                    sfc,
                    {"r_squared": None, "p_value": None},
                    min_periods,
                    min_r2,
                    max_p,
                    is_pct=True,
                )
            )
    return out


def forecast(
    df: pd.DataFrame,
    mode: str = "advanced",
    maturity: Optional[dict] = None,
    scenario: Optional[dict] = None,
    dimension: str = "auto",
    scope: str = "market",
) -> dict:
    """Scenario Planner entry point — total-landscape + brand-level forecasts."""
    scenario = scenario or {}
    df, est, mode, warnings = _estimate(df, mode, maturity, dimension, scope)
    if est.empty:
        return _jsonable(
            {
                "has_dates": False,
                "warnings": warnings + ["No estimable rows to forecast."],
            }
        )

    months = _month_series(df)
    if months is None:
        return _jsonable(
            {
                "has_dates": False,
                "warnings": warnings
                + ["No date column found — add a 'date' column to enable forecasting."],
            }
        )
    clean = df.assign(month=months).dropna(subset=["month"])
    if clean["month"].nunique() < 2:
        return _jsonable(
            {
                "has_dates": False,
                "warnings": warnings
                + ["Need at least 2 distinct months of data to forecast."],
            }
        )

    periods = int(scenario.get("periods", 6))
    growth_rate = float(scenario.get("growth_pct", 5)) / 100.0
    scen_mult = (
        float(scenario.get("market_mult", 1.0))
        * float(scenario.get("channel_mult", 1.0))
        * float(scenario.get("source_mult", 1.0))
    )
    alpha = float(scenario.get("alpha", 0.05))
    range_width = float(scenario.get("range_width", 1.0))
    method = str(scenario.get("method", "scenario_override"))
    unc = float(scenario.get("uncertainty_sensitivity", 1.0))
    metrics = scenario.get("metrics", ["spend", "sov"])
    q = scenario.get("quality", {}) or {}

    history = build_scenario_history(clean, est)
    hist, future, model_stats = build_regression_forecast(
        history,
        periods,
        growth_rate,
        scen_mult,
        alpha,
        range_width,
        method,
    )
    support = round(float(est["confidence"].mean()), 3)
    rel_score, rel_label = calculate_forecast_reliability(support, model_stats, periods)

    brands = build_brand_level_forecasts(
        clean,
        periods,
        growth_rate * 100,
        method,
        range_width,
        unc,
        metrics,
        int(q.get("min_periods", 12)),
        float(q.get("min_r2", 0.05)),
        float(q.get("max_p", 0.20)),
    )

    future_out = future.copy()
    future_out["month"] = future_out["month"].map(_iso)
    return _jsonable(
        {
            "has_dates": True,
            "mode": mode,
            "history": [
                {"month": _iso(m), "scenario_base_spend": float(v)}
                for m, v in zip(hist["month"], hist["scenario_base_spend"])
            ],
            "total_forecast": future_out.to_dict("records"),
            "model_stats": model_stats,
            "model_support_score": support,
            "reliability": {"score": rel_score, "label": rel_label},
            "brands": brands,
            "warnings": warnings,
        }
    )
