#!/usr/bin/env python3
"""Render current presentation PDFs and contact sheets for visual review."""
from pathlib import Path
import subprocess
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parents[1];out=R/'Docs/presentation-render';out.mkdir(exist_ok=True)
for name in ['submission-deck','pitch-deck']:
 subprocess.run(['pdftoppm','-scale-to','1200','-png',str(R/'Docs'/f'{name}.pdf'),str(out/name)],check=True)
 paths=sorted(out.glob(name+'-[0-9]*.png'));sheet=Image.new('RGB',(1500,300*((len(paths)+2)//3)),'white')
 for i,p in enumerate(paths):
  im=Image.open(p).convert('RGB');im.thumbnail((480,270));tile=Image.new('RGB',(500,300),'#dedede');tile.paste(im,(10,20));ImageDraw.Draw(tile).text((10,3),str(i+1),fill='black');sheet.paste(tile,((i%3)*500,(i//3)*300))
 sheet.save(out/f'{name}-contact.png');print(name,len(paths),'pages')
