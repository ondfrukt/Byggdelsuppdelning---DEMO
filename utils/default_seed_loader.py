import json
from pathlib import Path


def get_repo_root():
    return Path(__file__).resolve().parent.parent


def get_defaults_path():
    return get_repo_root() / 'defaults' / 'plm-defaults.json'


def load_default_seed_payload():
    defaults_path = get_defaults_path()
    if not defaults_path.exists():
        return {}

    with defaults_path.open('r', encoding='utf-8') as handle:
        payload = json.load(handle)
        return payload if isinstance(payload, dict) else {}
