"""Pure extraction-contract validation shared by adapter and deterministic scorer.

Confidence is mandatory for EVERY prompted component. All 161 successful
committed benchmark payloads use that shape, including five separate warning
confidences. An optional `government_warning` confidence is only an additional
conservative gate; it NEVER substitutes for any component or asserts coverage.
No coercion: JSON booleans are not numbers and string flags are not booleans.
"""
from __future__ import annotations

import math
from typing import TypeGuard

TEXT_FIELDS = (
    "brand_name", "class_type", "alcohol_content", "net_contents",
    "bottler_info", "country_of_origin", "government_warning_heading",
    "government_warning_body",
)
FLAG_FIELDS = (
    "government_warning_heading_all_caps", "government_warning_heading_bold",
    "government_warning_body_bold",
)
EXTRACTION_SCHEMA_FIELDS = list(TEXT_FIELDS + FLAG_FIELDS)
WARNING_COMPONENTS = TEXT_FIELDS[6:] + FLAG_FIELDS


def valid_confidence(value) -> TypeGuard[int | float]:
    # Range-check before isfinite so arbitrarily large JSON integers cannot
    # overflow a conversion to float. bool subclasses int, so use exact types.
    return (type(value) in (int, float) and 0 <= value <= 1
            and math.isfinite(value))


def confidence_keys(field: str) -> tuple[str, ...]:
    return WARNING_COMPONENTS if field == "government_warning" else (field,)


def field_confidence(extracted: dict, field: str):
    """Minimum mandatory confidence; absent/malformed evidence returns None."""
    conf = extracted.get("confidence")
    if not isinstance(conf, dict):
        return None
    keys = confidence_keys(field)
    if field == "government_warning" and "government_warning" in conf:
        keys += ("government_warning",)
    values: list[int | float] = []
    for key in keys:
        value = conf.get(key)
        if not valid_confidence(value):
            return None
        values.append(value)
    return min(values)


def validate_extraction(extracted) -> dict[str, str]:
    """Return errors keyed by affected extraction component, not verdict field.

    Null transcriptions/flags are schema-valid uncertainty; rules must refer
    them. A low but valid confidence also passes schema validation, not scoring.
    """
    if not isinstance(extracted, dict):
        return {"__root__": "extraction must be an object"}
    errors = {}
    conf = extracted.get("confidence")
    for key in EXTRACTION_SCHEMA_FIELDS:
        value = extracted.get(key)
        expected = bool if key in FLAG_FIELDS else str
        if key not in extracted:
            errors[key] = "missing extraction component"
        elif value is not None and type(value) is not expected:
            errors[key] = f"expected {expected.__name__} or null"
        if not isinstance(conf, dict) or not valid_confidence(conf.get(key)):
            errors[key] = "missing or invalid component confidence"
    if isinstance(conf, dict) and "government_warning" in conf:
        if not valid_confidence(conf["government_warning"]):
            errors["government_warning"] = "invalid additional warning confidence"
    return errors
