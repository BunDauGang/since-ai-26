"""Optional Gemini wording only. Numeric claims stay in deterministic evidence."""
import json
import logging
import os
import re
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


def _request(facts, key, instruction=INSTRUCTION):
    model = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash')
    if not re.fullmatch(r'[a-zA-Z0-9._-]+', model):
        raise ValueError('Invalid Gemini model name')
    payload = {'systemInstruction': {'parts': [{'text': instruction}]},
               'contents': [{'role': 'user', 'parts': [{'text': json.dumps(facts)}]}],
               'generationConfig': {'responseMimeType': 'application/json', 'temperature': 0}}
    request = urllib.request.Request(
        f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
        data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
    with urllib.request.urlopen(request, timeout=10) as response:
        data = json.load(response)
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


STORY_INSTRUCTION = (
    "You help a Lindström key account manager open and close a customer meeting. Using ONLY the supplied "
    "persona, goal, customer name and industry, return JSON {\"opening_line\": string, \"closing_line\": string}: "
    "one warm, plain-English sentence each, at most 30 words. Never use digits, quantities, percentages, money, "
    "dates, competitor names, or the words audited, verified, certified or guaranteed. "
    "The application adds every number and piece of evidence itself.")
STORY_UNSAFE = re.compile(r'[€$£]|\bguarantee', re.I)


def _safe_line(value):
    if not isinstance(value, str):
        raise ValueError('Missing line')
    value = ' '.join(value.split())
    if not value or len(value) > 240 or UNSAFE.search(value) or STORY_UNSAFE.search(value):
        raise ValueError('Unsupported prose or numeric claim')
    return value


def story_talk_track(review, persona, goal, minutes, fallback):
    """Optional AI framing for /api/story: one opening and one closing sentence, no numbers.

    The deterministic talk track (all numbers, points, objections and the ask) is kept unchanged; without a key
    or on any rejected answer the template is returned as is.
    """
    key = os.getenv('GEMINI_API_KEY')
    if not key:
        return fallback
    try:
        meta = review.get('meta', {})
        facts = {'persona': persona, 'goal': str(goal)[:200], 'customer': meta.get('customer_name', ''),
                 'industry': meta.get('industry', '')}
        out = _request(facts, key, STORY_INSTRUCTION)
        if not isinstance(out, dict):
            raise ValueError('Wrong shape')
        opening, closing = _safe_line(out.get('opening_line')), _safe_line(out.get('closing_line'))
        result = dict(fallback)
        result['opening'] = opening + ' ' + fallback['opening']
        result['closing'] = closing
        result['source'] = 'template+ai_wording'
        return result
    except Exception:
        log.warning('Gemini story wording unavailable or rejected; using the deterministic talk track')
        return fallback
