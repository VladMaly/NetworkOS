"""One way to ask the model for a structured answer, through OpenRouter. Every agent step asks for JSON that matches a
Pydantic model, so nothing downstream parses free text. Research can add OpenRouter's web search plugin."""
import json
from typing import Any, TypeVar

import openai
from pydantic import BaseModel

from .config import AGENT_MODEL, OPENROUTER_API_KEY, OPENROUTER_URL

client = openai.AsyncOpenAI(base_url=OPENROUTER_URL, api_key=OPENROUTER_API_KEY or "missing")

T = TypeVar("T", bound=BaseModel)

WEB_SEARCH = {"id": "web", "max_results": 5}


class AgentError(Exception):
    pass


def strict_schema(model: type[BaseModel]) -> dict[str, Any]:
    """Pydantic's schema, tightened for structured outputs: every field required, no extra keys, no titles."""
    def tidy(node: Any) -> Any:
        if isinstance(node, dict):
            node = {k: tidy(v) for k, v in node.items() if k not in ("title", "default")}
            if node.get("type") == "object" and "properties" in node:
                node["required"] = list(node["properties"])
                node["additionalProperties"] = False
            return node
        if isinstance(node, list):
            return [tidy(v) for v in node]
        return node
    return tidy(model.model_json_schema())


async def ask(schema: type[T], system: str, prompt: str, *, effort: str = "medium", web: bool = False) -> tuple[T, dict[str, int], list[dict[str, str]]]:
    if not OPENROUTER_API_KEY:
        raise AgentError("No OpenRouter API key is set. Add OPENROUTER_API_KEY to the agents service.")
    extra: dict[str, Any] = {
        "reasoning": {"effort": effort},
        "provider": {"require_parameters": True},  # only route to providers that honour the JSON schema
    }
    if web:
        extra["plugins"] = [WEB_SEARCH]
    try:
        resp = await client.chat.completions.create(
            model=AGENT_MODEL,
            max_tokens=16000,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            response_format={"type": "json_schema", "json_schema": {"name": schema.__name__, "strict": True, "schema": strict_schema(schema)}},
            extra_body=extra,
        )
    except openai.AuthenticationError as e:
        raise AgentError("The OpenRouter API key is wrong. Check OPENROUTER_API_KEY.") from e
    except openai.RateLimitError as e:
        raise AgentError("OpenRouter is rate limiting us. Try again in a minute.") from e
    except openai.APIStatusError as e:
        if e.status_code == 402:
            raise AgentError("OpenRouter is out of credits. Top up at openrouter.ai/credits.") from e
        raise AgentError(f"OpenRouter error {e.status_code}: {e.message}") from e
    except openai.APIConnectionError as e:
        raise AgentError("Couldn't reach OpenRouter.") from e

    usage = {"input": resp.usage.prompt_tokens or 0, "output": resp.usage.completion_tokens or 0} if resp.usage else {"input": 0, "output": 0}
    if not resp.choices:
        raise AgentError("The model returned no answer.")
    msg = resp.choices[0].message
    sources = [
        {"title": a.url_citation.title or a.url_citation.url, "url": a.url_citation.url}
        for a in (getattr(msg, "annotations", None) or [])
        if getattr(a, "type", "") == "url_citation" and getattr(a, "url_citation", None)
    ]
    text = (msg.content or "").strip()
    if text.startswith("```"):  # some providers wrap JSON in a code fence despite the schema
        text = text.strip("`").removeprefix("json").strip()
    try:
        return schema.model_validate_json(text), usage, sources
    except ValueError as e:
        raise AgentError(f"The model's answer didn't match the expected shape: {json.dumps(text[:200])}") from e
