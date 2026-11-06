"""Optional Gemini wording only. Numeric claims stay in deterministic evidence."""
import json
import logging
import os
import re
import urllib.request

log = logging.getLogger(__name__)
INSTRUCTION = '''Write concise executive prose using ONLY the supplied structured facts.
Do not calculate, infer causes, assert compliance or claim savings are guaranteed.
Return a JSON array in input order with rule_id, observation, recommended_action,
and steering_question strings. Do not use digits, numeric words, percentages,
quantities or site identifiers in prose. The application appends exact evidence.
Do not claim outputs are audited, verified or certified. No markdown.'''


def _request(facts, key):
    model = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash')
    if not re.fullmatch(r'[a-zA-Z0-9._-]+', model):
        raise ValueError('Invalid Gemini model name')
    payload = {'systemInstruction': {'parts': [{'text': INSTRUCTION}]},
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
                if not isinstance(value, str) or not value.strip() or len(value) > 650 or UNSAFE.search(value):
                    raise ValueError('Unsupported prose or numeric claim')
                output[field] = value.strip()
            # No model-generated numeric text is accepted. Evidence is copied verbatim from code.
            output['observation'] += base['observation'][base['observation'].find(' Evidence:'):] if ' Evidence:' in base['observation'] else ' ' + base['observation']
            output['status'] = 'AI_GENERATED_FROM_CALCULATED_DATA'
            result.append(output)
        return result
    except Exception:
        # Do not log responses, headers or exception strings (may contain credentials).
        log.warning('Gemini wording unavailable or rejected; using deterministic observations')
        return fallback
