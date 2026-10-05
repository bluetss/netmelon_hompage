"""Read-only actual-serving appearance validation of the three registered sites."""
import argparse
import os
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--runtime', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--site', choices=('company', 'studio', 'landing'), required=True)
args = parser.parse_args()
if os.environ.get('NPQ_OWNER_OPERATION_ENVIRONMENT') != 'staging':
    parser.error('requires staging owner-operation')
if not all(Path(p).resolve().is_relative_to(Path('/tmp')) for p in (args.runtime, args.output)):
    parser.error('runtime and evidence must be in /tmp')
base = {'company': 'https://company-dev.netmelonai.com',
        'studio': 'https://studio-dev.naepopquiz.com',
        'landing': 'https://app-dev.naepopquiz.com'}[args.site]
env = dict(os.environ, PLAYWRIGHT_BROWSERS_PATH=str(Path(args.runtime)/'browsers'))
raise SystemExit(subprocess.call(['node', str(Path(__file__).with_name('verify_theme_browser.cjs')),
    args.runtime, base, args.output, args.site], env=env))
