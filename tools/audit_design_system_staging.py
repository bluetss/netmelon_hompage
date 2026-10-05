"""Read-only staging typography/layout audit for registered web surfaces."""
import argparse
import os
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--runtime', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--site', choices=('company', 'landing', 'studio'), required=True)
args = parser.parse_args()
if os.environ.get('NPQ_OWNER_OPERATION_ENVIRONMENT') != 'staging':
    parser.error('requires npq owner-operation staging execution')
if not all(Path(value).resolve().is_relative_to(Path('/tmp')) for value in (args.runtime, args.output)):
    parser.error('runtime and screenshots must be session-local /tmp paths')
origins = {'company':'https://company-dev.netmelonai.com',
           'landing':'https://app-dev.naepopquiz.com',
           'studio':'https://studio-dev.naepopquiz.com'}
raise SystemExit(subprocess.call(['node',str(Path(__file__).with_name('verify_design_system_browser.cjs')),
    args.runtime,origins[args.site],args.output,args.site]))
