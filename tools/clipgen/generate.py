"""Suno generation via a third-party reseller API (default: kie.ai).

NOTE: There is no official Suno API. Reseller schemas drift, so the request /
response field names below are the parts most likely to need a small tweak if
kie.ai changes their docs. Everything provider-specific is contained here.

kie.ai (as documented): https://docs.kie.ai/suno-api/generate-music
  POST  {base}/api/v1/generate            -> { data: { taskId } }
  GET   {base}/api/v1/generate/record-info?taskId=...
        -> { data: { status, response: { sunoData: [ { audioUrl, ... } ] } } }
"""
import time
import requests

import config

CFG = config.CFG


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {CFG.api_key}",
        "Content-Type": "application/json",
    }


def _extract_audio_url(data: dict) -> str | None:
    """Pull the first audio URL out of a completed record, tolerant of shape."""
    resp = data.get("response") or data
    items = (
        resp.get("sunoData")
        or resp.get("data")
        or resp.get("clips")
        or []
    )
    if not items:
        return None
    first = items[0]
    return first.get("audioUrl") or first.get("audio_url") or first.get("url")


def generate(prompt: str, instrumental: bool = True) -> str:
    """Kick off a generation, poll to completion, return an audio URL."""
    if not CFG.api_key:
        raise RuntimeError(
            "SUNO_API_KEY is not set. Copy tools/clipgen/.env.example to "
            "tools/clipgen/.env and add your key."
        )

    body = {
        "prompt": prompt,
        "style": CFG.style,
        "title": "chord-trainer-clip",
        "customMode": True,
        "instrumental": instrumental,
        "model": CFG.model,
    }
    r = requests.post(
        f"{CFG.base_url}/api/v1/generate", json=body, headers=_headers(), timeout=30
    )
    r.raise_for_status()
    payload = r.json()
    task_id = (payload.get("data") or {}).get("taskId") or payload.get("taskId")
    if not task_id:
        raise RuntimeError(f"No taskId in generate response: {payload}")

    for _ in range(CFG.poll_max):
        time.sleep(CFG.poll_interval)
        rr = requests.get(
            f"{CFG.base_url}/api/v1/generate/record-info",
            params={"taskId": task_id},
            headers=_headers(),
            timeout=30,
        )
        rr.raise_for_status()
        data = (rr.json().get("data")) or {}
        status = str(data.get("status", "")).upper()
        if status in ("SUCCESS", "COMPLETE", "COMPLETED", "FIRST_SUCCESS"):
            url = _extract_audio_url(data)
            if url:
                return url
        if status in ("FAILED", "ERROR", "CREATE_TASK_FAILED"):
            raise RuntimeError(f"Generation failed: {data}")

    raise TimeoutError("Generation timed out while polling for the audio URL.")
