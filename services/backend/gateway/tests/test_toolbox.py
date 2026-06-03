"""Unit tests for the toolbox response-normalisation policy.

The toolbox-core async client surfaces tool output in three different shapes
depending on the version, and a small misclassification (e.g. coercing an ISO
date to a float) corrupts the dashboard at the cell level. These tests pin
the policy in `normalise_rows` + `_coerce_cell` so a future toolbox upgrade
doesn't silently change the behaviour.
"""

from __future__ import annotations

import json

import pytest

from api.toolbox import normalise_rows


class TestNormaliseRowsShape:
    """The three response shapes the async client emits + the trivial ones."""

    def test_none_returns_empty_list(self) -> None:
        assert normalise_rows(None) == []

    def test_bare_dict_returns_single_row(self) -> None:
        assert normalise_rows({"a": 1, "b": "x"}) == [{"a": 1, "b": "x"}]

    def test_json_encoded_string_with_list_of_rows(self) -> None:
        rows = [{"name": "alpha", "spend": "100.5"}, {"name": "beta", "spend": "75"}]
        assert normalise_rows(json.dumps(rows)) == [
            {"name": "alpha", "spend": 100.5},
            {"name": "beta", "spend": 75.0},
        ]

    def test_json_encoded_string_with_single_dict(self) -> None:
        assert normalise_rows(json.dumps({"k": "v"})) == [{"k": "v"}]

    def test_json_encoded_string_with_scalar(self) -> None:
        assert normalise_rows(json.dumps(42)) == [{"value": 42}]

    def test_list_of_dicts_passes_through(self) -> None:
        assert normalise_rows([{"a": 1}, {"a": 2}]) == [{"a": 1}, {"a": 2}]

    def test_list_with_one_json_encoded_string(self) -> None:
        rows = [{"x": 1}]
        assert normalise_rows([json.dumps(rows)]) == [{"x": 1}]

    def test_list_of_scalars_wraps_each_in_value_key(self) -> None:
        assert normalise_rows([1, 2, 3]) == [{"value": 1}, {"value": 2}, {"value": 3}]

    def test_bare_scalar_wraps_in_value_key(self) -> None:
        assert normalise_rows(42) == [{"value": 42}]

    def test_non_json_string_falls_back_to_value_row(self) -> None:
        # A non-JSON string shouldn't be dropped — it shouldn't happen in
        # practice but the path needs to be defensive.
        assert normalise_rows("not json {{{") == [{"value": "not json {{{"}]


class TestCellCoercion:
    """The number-vs-string policy. BigQuery NUMERIC arrives as a string;
    rates like `ctr=0.022309` MUST become floats or `.toFixed()` blows up in
    the browser. ISO dates and names MUST stay strings."""

    @pytest.mark.parametrize(
        "value,expected",
        [
            ("0.022309", 0.022309),
            ("100", 100.0),
            ("100.5", 100.5),
            ("-1.5e-3", -1.5e-3),
            ("-42", -42.0),
            (".5", 0.5),
            ("5.", 5.0),
        ],
    )
    def test_numeric_strings_become_floats(self, value: str, expected: float) -> None:
        assert normalise_rows({"v": value}) == [{"v": expected}]

    @pytest.mark.parametrize(
        "value",
        [
            "2024-01-31",  # ISO date — must stay string
            "2024-W05",  # ISO week — must stay string
            "192.168.1.1",  # not a number — must stay string
            "Alpha Network",  # name
            "",  # empty string stays string (not 0)
            "true",  # JSON-bool-as-string
            "1.2.3",  # too many dots
            "1e",  # incomplete exponent
            "abc",
        ],
    )
    def test_non_numeric_strings_stay_strings(self, value: str) -> None:
        assert normalise_rows({"v": value}) == [{"v": value}]

    def test_native_numbers_pass_through_unchanged(self) -> None:
        assert normalise_rows({"i": 7, "f": 1.5}) == [{"i": 7, "f": 1.5}]

    def test_booleans_pass_through_unchanged(self) -> None:
        # `_coerce_cell` only touches strings — bools, None, dicts unchanged.
        assert normalise_rows({"flag": True, "n": None}) == [{"flag": True, "n": None}]

    def test_nan_and_inf_in_string_form_stay_strings(self) -> None:
        # `float("inf")` succeeds but the policy rejects non-finite values.
        for v in ("inf", "-inf", "nan", "NaN"):
            assert normalise_rows({"v": v}) == [{"v": v}]
