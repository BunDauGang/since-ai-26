"""Optional Gemini wording only. Numeric claims stay in deterministic evidence."""
import json
import logging
import os
import re
import urllib.error
import urllib.request

log = logging.getLogger(__name__)
APPROVED_PROSE = {
    'observation': ['Review the supplied evidence with the account team.', 'Discuss this finding using the supplied evidence.'],
    'recommended_action': ['Confirm the source with the site team.', 'Confirm the proposed plan with the account team.'],
    'steering_question': ['Which action should the account team prioritize?', 'Who should confirm the evidence and follow-up?'],
}
INSTRUCTION = ("Select wording using ONLY the supplied facts. Return a JSON array in input order "
               "with rule_id, observation, recommended_action and steering_question. For each prose "
               "field copy exactly one of these approved strings; do not edit them: "
               + json.dumps(APPROVED_PROSE) + ". The application appends immutable evidence and action plans.")


# gemini-2.5-flash is no longer offered to new API users; a fast lite model keeps the prep responsive.
DEFAULT_MODEL = 'gemini-3.5-flash-lite'
RETRY_STATUS = {404, 429, 500, 503}  # retired, rate-limited or overloaded model: try the next one


def _models():
    names = [os.getenv('GEMINI_MODEL', DEFAULT_MODEL)]
    names += [m.strip() for m in os.getenv('GEMINI_FALLBACK_MODELS', '').split(',') if m.strip()]
    for model in names:
        if not re.fullmatch(r'[a-zA-Z0-9._-]+', model):
            raise ValueError('Invalid Gemini model name')
    return list(dict.fromkeys(names))


def _request(facts, key, instruction=INSTRUCTION):
    payload = {'systemInstruction': {'parts': [{'text': instruction}]},
               'contents': [{'role': 'user', 'parts': [{'text': json.dumps(facts)}]}],
               'generationConfig': {'responseMimeType': 'application/json', 'temperature': 0}}
    models = _models()
    for i, model in enumerate(models):
        request = urllib.request.Request(
            f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
            data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                data = json.load(response)
        except urllib.error.HTTPError as exc:
            # Never log the response body or headers (may echo credentials); only move on or re-raise.
            if exc.code in RETRY_STATUS and i < len(models) - 1:
                continue
            raise
        return json.loads(data['candidates'][0]['content']['parts'][0]['text'])


# Reject spelled-out quantities too. Fail closed; deterministic fallback is always available.
UNSAFE = re.compile(r'\d|%|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|dozen|quarter|hundred|thousand|million|billion|half|double|triple|twice|percent|audited|verified|certified)\b', re.I)


def polish(facts, fallback):
    key = os.getenv('GEMINI_API_KEY')
    if not key:
        return fallback
    try:
        rows = _request(facts, key)
        if not isinstance(rows, list) or len(rows) != len(facts):
            raise ValueError('Wrong observation count')
        result = []
        for fact, base, row in zip(facts, fallback, rows):
            if row.get('rule_id') != fact['rule_id']:
                raise ValueError('Changed fact identity')
            output = dict(base)
            for field in ['observation', 'recommended_action', 'steering_question']:
                value = row[field]
                if not isinstance(value, str) or not value.strip() or len(value) > 650 or UNSAFE.search(value) or value not in APPROVED_PROSE[field]:
                    raise ValueError('Unsupported prose or numeric claim')
                output[field] = value.strip() + ' ' + base[field]
            # All substantive claims, numeric evidence and targets stay deterministic.
            output['status'] = 'AI_GENERATED_FROM_CALCULATED_DATA'
            result.append(output)
        return result
    except Exception:
        # Do not log responses, headers or exception strings (may contain credentials).
        log.warning('Gemini wording unavailable or rejected; using deterministic observations')
        return fallback


# Story wording is deliberately bounded: no model-generated numbers or claims.
STORY_PROSE = {
    'opening': ['Start with the relationship and the evidence that matters to this audience.',
                'Use the supplied evidence to frame a shared customer decision.'],
    'ask': ['Agree the next investigation, its owner and the evidence needed for follow-up.',
            'Confirm the assumptions together before choosing the next action.'],
}
STORY_INSTRUCTION = (
    'Select an opening and ask appropriate to the supplied persona and goal. '
    'Return a JSON object with exactly opening and ask. Copy each value verbatim '
    'from the approved options below. Do not calculate, add quantities or make new claims. '
    + json.dumps(STORY_PROSE))


def _request_story(payload, key):
    return _request(payload, key, instruction=STORY_INSTRUCTION)


def _polish_story_template(template):
    from copy import deepcopy
    key = os.getenv('GEMINI_API_KEY')
    if not key:
        return template
    # Send compact structured evidence, never the workbook, meeting notes or full review.
    payload = dict(persona=template['persona'], goal=template['goal'], minutes=template['minutes'],
                   facts=[dict(metric_ids=p['metric_ids'], evidence=[
                       {k: e[k] for k in ('id', 'value', 'unit', 'status')} for e in p['evidence']])
                          for p in template['points']])
    try:
        wording = _request_story(payload, key)
        if not isinstance(wording, dict) or set(wording) != set(STORY_PROSE):
            raise ValueError('Invalid story wording fields')
        for field, options in STORY_PROSE.items():
            value = wording[field]
            if not isinstance(value, str) or UNSAFE.search(value) or value not in options:
                raise ValueError('Unsupported story claim or numeric text')
        result = deepcopy(template)
        for field in STORY_PROSE:
            result[field] = wording[field] + ' ' + template[field]
        result.update(source='gemini', status='AI_WORDING_FROM_REVIEW')
        return result
    except Exception:
        log.warning('Story wording unavailable or rejected; using deterministic template')
        return template


def story_talk_track(review, persona='ceo', goal='', minutes=15, fallback=None):
    """Hook accepted by the Lead's /api/story adapter (including offline fallback).

    Build a grounded template instead of trusting arbitrary claims in fallback.
    API callers wanting no model request can use story.generate_story(use_llm=False).
    """
    from .story import generate_story
    return generate_story(review, persona, goal, minutes, use_llm=True)
