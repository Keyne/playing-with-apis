#!/usr/bin/env python3
"""Review the API error catalog with an external model or a local Qwen.

Dry-run by default: prints the model's JSON and the check result.
  AI_PROVIDER=xai     OpenAI-compatible API at https://api.x.ai/v1
                      Requires XAI_API_KEY and XAI_MODEL.
  AI_PROVIDER=ollama  Local Ollama. Default model qwen2.5:7b.
                      OLLAMA_BASE_URL defaults to http://127.0.0.1:11434.

--write stores a valid answer at docs/prompts/error-catalog.suggestion.json.
It does not edit the TypeScript catalog. Copy accepted lines by hand.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROMPT_PATH = ROOT / "docs" / "prompts" / "error-messages.md"
SUGGESTION_PATH = ROOT / "docs" / "prompts" / "error-catalog.suggestion.json"

CODES = (
    "VALIDATION_ERROR",
    "UNKNOWN_SKU",
    "CATALOG_UNAVAILABLE",
    "ORDER_NOT_FOUND",
    "DISCOUNT_RULE_NOT_FOUND",
    "INTERNAL",
)

BANNED = ("select ", "insert ", "stack", "traceback", "exception", "$1", "postgres", "mongo")


def load_prompt() -> str:
    text = PROMPT_PATH.read_text(encoding="utf-8")
    start = text.find("```text")
    end = text.find("```", start + 3)
    if start < 0 or end < 0:
        raise SystemExit(f"prompt fence missing in {PROMPT_PATH}")
    return text[start + len("```text") : end].strip()


def check(payload: object) -> list[str]:
    problems: list[str] = []
    if not isinstance(payload, list):
        return ["a saída não é uma lista JSON"]
    seen: set[str] = set()
    for item in payload:
        if not isinstance(item, dict):
            problems.append("item que não é objeto")
            continue
        code = item.get("code")
        message = item.get("message")
        if code not in CODES:
            problems.append(f"code desconhecido: {code}")
            continue
        if code in seen:
            problems.append(f"code repetido: {code}")
        seen.add(code)
        if not isinstance(message, str) or not 10 <= len(message.strip()) <= 180:
            problems.append(f"{code}: tamanho da mensagem")
            continue
        if message != message.strip():
            problems.append(f"{code}: espaço nas pontas")
        lowered = message.lower()
        for word in BANNED:
            if word in lowered:
                problems.append(f"{code}: contém {word!r}")
        if "@" in message:
            problems.append(f"{code}: contém @")
        if "tente novamente" in lowered or "try again" in lowered:
            problems.append(f"{code}: promete nova tentativa")
    missing = [code for code in CODES if code not in seen]
    if missing:
        problems.append("faltam codes: " + ", ".join(missing))
    return problems


def extract_json(raw: str) -> object:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        text = text.rsplit("```", 1)[0]
    return json.loads(text)


def call_xai(prompt: str) -> str:
    key = os.environ.get("XAI_API_KEY", "")
    model = os.environ.get("XAI_MODEL", "")
    if not key or not model:
        raise SystemExit("AI_PROVIDER=xai precisa de XAI_API_KEY e XAI_MODEL (id atual em https://docs.x.ai).")
    body = json.dumps(
        {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
        }
    ).encode()
    request = urllib.request.Request(
        "https://api.x.ai/v1/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        data = json.load(response)
    return data["choices"][0]["message"]["content"]


def call_ollama(prompt: str) -> str:
    base = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    model = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b")
    body = json.dumps(
        {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
        }
    ).encode()
    request = urllib.request.Request(
        f"{base}/api/chat",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        data = json.load(response)
    return data["message"]["content"]


def main() -> int:
    parser = argparse.ArgumentParser(description="Revisa as mensagens de erro com um modelo.")
    parser.add_argument("--write", action="store_true", help="grava a sugestão JSON se a checagem passar")
    args = parser.parse_args()
    provider = os.environ.get("AI_PROVIDER", "xai")
    prompt = load_prompt()
    try:
        if provider == "ollama":
            raw = call_ollama(prompt)
        elif provider == "xai":
            raw = call_xai(prompt)
        else:
            raise SystemExit("AI_PROVIDER deve ser xai ou ollama")
    except urllib.error.URLError as error:
        raise SystemExit(f"falha ao chamar o modelo: {error}") from error

    print(raw)
    try:
        payload = extract_json(raw)
    except json.JSONDecodeError as error:
        print(f"JSON inválido: {error}", file=sys.stderr)
        return 1
    problems = check(payload)
    if problems:
        print("recusado:", file=sys.stderr)
        for problem in problems:
            print(f"- {problem}", file=sys.stderr)
        return 1
    print("aceito")
    if args.write:
        SUGGESTION_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"sugestão em {SUGGESTION_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
