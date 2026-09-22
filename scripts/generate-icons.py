#!/usr/bin/env python3
"""Export the approved Icon Composer artwork and derive platform icon files.
Requires macOS, Xcode with Icon Composer, and Pillow (python3 -m pip install Pillow).
"""
from pathlib import Path
import subprocess
import tempfile
from PIL import Image

root = Path(__file__).resolve().parent.parent
assets = root / 'src/assets'
xcode = Path(subprocess.check_output(['xcode-select', '-p'], text=True).strip())
ictool = xcode.parent / 'Applications/Icon Composer.app/Contents/Executables/ictool'
subprocess.run([str(ictool), str(assets / 'bedrock.icon'), '--export-image',
                '--output-file', str(assets / 'icon.png'), '--platform', 'macOS',
                '--rendition', 'Default', '--width', '1024', '--height', '1024',
                '--scale', '1'], check=True)
with Image.open(assets / 'icon.png') as source:
    image = source.convert('RGBA')
    image.save(assets / 'icon.ico', sizes=[(n, n) for n in (16, 24, 32, 48, 64, 128, 256)])
    with tempfile.TemporaryDirectory(prefix='bedrock-icons-') as temp:
        iconset = Path(temp) / 'Bedrock.iconset'
        iconset.mkdir()
        for size in (16, 32, 128, 256, 512):
            for scale in (1, 2):
                suffix = '@2x' if scale == 2 else ''
                image.resize((size * scale, size * scale), Image.Resampling.LANCZOS).save(
                    iconset / f'icon_{size}x{size}{suffix}.png')
        subprocess.run(['iconutil', '-c', 'icns', str(iconset), '-o', str(assets / 'icon.icns')], check=True)
print('Generated icon.png, icon.ico, and icon.icns from bedrock.icon')
