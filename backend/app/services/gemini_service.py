"""Only translate a server-owned disaster bulletin; never ask AI to invent routes."""

from ..core.config import settings

EVENT = {
    "id": "event_001",
    "disasterType": "earthquake",
    "title": "地震を想定した避難訓練",
    "text": "これは訓練です。周囲の状況を確認し、落下物や通行できない道路を避けてください。支援を待つ間も、自身の避難を優先してください。",
    "source": "TASUKU 模擬シナリオ",
    "issuedAt": "2026-11-05T00:00:00Z",
    "dataStatus": "simulation",
}
ENGLISH = "This is a drill. Check your surroundings and avoid falling objects and blocked roads. Prioritize your own evacuation, including while waiting for assistance."


def translate(language):
    fallback = EVENT["text"] if language == "ja" else ENGLISH
    config = settings()
    if not config.gemini_api_key:
        return {
            "text": fallback,
            "provider": "template",
            "sourceText": EVENT["text"],
            "requiresReview": False,
        }
    try:
        from google import genai
        from google.genai import types

        with genai.Client(
            api_key=config.gemini_api_key, http_options=types.HttpOptions(timeout=15000)
        ) as client:
            response = client.models.generate_content(
                model=config.gemini_model,
                contents=EVENT["text"],
                config=types.GenerateContentConfig(
                    temperature=0,
                    max_output_tokens=600,
                    system_instruction=f"Translate the supplied disaster drill notice into {'simple Japanese' if language == 'ja' else 'English'}. Preserve every instruction and the drill label. Do not add facts, route advice, or safety judgments. Return only the translation.",
                ),
            )
        if not response.text or len(response.text) > 3000:
            raise ValueError("Empty or oversized translation")
        return {
            "text": response.text,
            "provider": "gemini",
            "sourceText": EVENT["text"],
            "requiresReview": True,
        }
    except Exception:
        return {
            "text": fallback,
            "provider": "template_fallback",
            "sourceText": EVENT["text"],
            "requiresReview": False,
        }
