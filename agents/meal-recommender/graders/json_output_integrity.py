from __future__ import annotations

import json

from holodeck.lib.test_runner.code_grader import GraderContext, GraderResult

REQUIRED_FIELDS = {
    "mealName",
    "suggestedMealType",
    "prepTimeMinutes",
    "cuisine",
    "description",
    "usesIngredients",
    "expiringIngredients",
    "missingIngredients",
}


def grade(ctx: GraderContext) -> GraderResult:
    raw = ctx.agent_response.strip()

    if raw.startswith("```"):
        return GraderResult(
            score=0.0,
            passed=False,
            reason="Response wrapped in markdown fences — must be raw JSON",
            details={"raw_prefix": raw[:80]},
        )

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        return GraderResult(
            score=0.0,
            passed=False,
            reason=f"Response is not valid JSON: {exc}",
            details={"raw_prefix": raw[:200]},
        )

    if not isinstance(data, list):
        return GraderResult(
            score=0.0,
            passed=False,
            reason=f"Expected a JSON array, got {type(data).__name__}",
        )

    if len(data) == 0:
        return GraderResult(
            score=0.0,
            passed=False,
            reason="JSON array is empty — expected 3-5 meal objects",
        )

    failures: list[str] = []
    for i, meal in enumerate(data):
        if not isinstance(meal, dict):
            failures.append(f"Item {i} is not an object (got {type(meal).__name__})")
            continue
        missing = REQUIRED_FIELDS - meal.keys()
        if missing:
            failures.append(f"Item {i} missing fields: {sorted(missing)}")

    if failures:
        score = max(0.0, 1.0 - len(failures) / len(data))
        return GraderResult(
            score=score,
            passed=False,
            reason=f"{len(failures)} meal(s) failed schema check",
            details={"failures": failures},
        )

    return GraderResult(
        score=1.0,
        passed=True,
        reason=f"All {len(data)} meals have required fields and response is valid JSON",
    )
