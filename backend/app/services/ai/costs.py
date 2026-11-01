"""Approximate list-price cost estimation for AI usage.

Rates are USD per one million tokens and reflect published list prices at the
time of writing. Free tiers may bill nothing; the admin UI labels these values
as *estimated list-price value*, not an invoice. Unknown models return ``None``
rather than a fabricated number.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.services.ai.base import ChatResult


@dataclass(frozen=True)
class ModelRate:
    input_per_million: float
    output_per_million: float


MODEL_RATES: dict[str, ModelRate] = {
    # Google Gemini (AI Studio pricing)
    "gemini-2.5-flash": ModelRate(0.30, 2.50),
    "gemini-2.5-flash-lite": ModelRate(0.10, 0.40),
    "gemini-2.0-flash": ModelRate(0.10, 0.40),
    "gemini-2.0-flash-lite": ModelRate(0.075, 0.30),
    # Groq (per-model list prices)
    "llama-3.3-70b-versatile": ModelRate(0.59, 0.79),
    "llama-3.1-8b-instant": ModelRate(0.05, 0.08),
    # OpenAI
    "gpt-4o-mini": ModelRate(0.15, 0.60),
    "gpt-4.1-mini": ModelRate(0.40, 1.60),
}


def estimate_cost(
    model: str | None, prompt_tokens: int | None, completion_tokens: int | None
) -> float | None:
    if not model:
        return None
    rate = MODEL_RATES.get(model.strip().lower())
    if rate is None:
        return None
    prompt = max(0, prompt_tokens or 0)
    completion = max(0, completion_tokens or 0)
    value = (
        prompt / 1_000_000 * rate.input_per_million
        + completion / 1_000_000 * rate.output_per_million
    )
    return round(value, 8)


def result_cost(result: ChatResult) -> float | None:
    return estimate_cost(result.model, result.prompt_tokens, result.completion_tokens)
