"""Decode the CI notarization key without logging its contents."""
import base64
import os
from pathlib import Path

# Secret stores often preserve line wrapping or a trailing newline.
encoded = ''.join(os.environ['APPLE_API_KEY_P8_BASE64'].split())
decoded = base64.b64decode(encoded, validate=True)
if not decoded.strip().startswith(b'-----BEGIN PRIVATE KEY-----'):
    raise ValueError('The notarization secret must contain a Base64-encoded PEM private key.')
key = Path(os.environ['RUNNER_TEMP']) / 'AuthKey.p8'
fd = os.open(key, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'wb') as output:
    os.fchmod(output.fileno(), 0o600)
    output.write(decoded)
