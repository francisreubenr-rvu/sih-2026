#!/usr/bin/env python3
"""Render current process Markdown without rewriting historical artifacts."""
from pathlib import Path
import re, html
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
R=Path(__file__).resolve().parents[1]
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='BodyCopy',fontName='Helvetica',fontSize=10,leading=14,spaceAfter=8,textColor=colors.HexColor('#15211f')))
styles.add(ParagraphStyle(name='CellCopy',parent=styles['BodyCopy'],fontSize=8,leading=11,spaceAfter=2))
def markup(s):
 for a,b in [('→',' > '),('—','-'),('–','-'),('’',"'"),('“','"'),('”','"'),('×','x')]:s=s.replace(a,b)
 s=html.escape(s)
 s=re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',s)
 return re.sub(r'`([^`]+)`',r'<font name="Courier">\1</font>',s)
def footer(c,d):
 c.setFont('Helvetica',8);c.setFillColor(colors.HexColor('#52645c'))
 c.drawString(42,28,'SIGHTLINE / SIH26171 / ENGINEERING CANDIDATE - NOT SUBMISSION READY');c.drawRightString(553,28,str(d.page))
story=[]
for block in (R/'Docs/process-documentation.md').read_text().split('\n\n'):
 block=block.strip()
 if not block:continue
 if block.startswith('|'):
  rows=[line.strip('|').split('|') for line in block.splitlines() if not re.match(r'^\|[- :|]+$',line)]
  cells=[[Paragraph(markup(v.strip()),styles['CellCopy']) for v in row] for row in rows]
  t=Table(cells,colWidths=[507/len(rows[0])]*len(rows[0]),repeatRows=1,hAlign='LEFT')
  t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e3ead6')),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,-1),.4,colors.HexColor('#b9c4bb')),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
  story += [t,Spacer(1,12)]
 elif block.startswith('# '):story.append(Paragraph(markup(block[2:]),styles['Title']))
 elif block.startswith('## '):story.append(Paragraph(markup(block[3:]),styles['Heading2']))
 else:story.append(Paragraph(markup(block).replace('\n','<br/>'),styles['BodyCopy']))
SimpleDocTemplate(str(R/'Docs/process-documentation.pdf'),pagesize=A4,leftMargin=44,rightMargin=44,topMargin=42,bottomMargin=55,title='Sightline engineering methodology and evidence').build(story,onFirstPage=footer,onLaterPages=footer)
