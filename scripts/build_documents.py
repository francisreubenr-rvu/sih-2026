#!/usr/bin/env python3
from pathlib import Path
import re,html
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,PageBreak,KeepTogether
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
R=Path(__file__).resolve().parents[1];styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='TitleCustom',fontName='Helvetica-Bold',fontSize=30,leading=34,textColor=colors.HexColor('#15211f'),spaceAfter=24))
styles.add(ParagraphStyle(name='SectionCustom',fontName='Helvetica-Bold',fontSize=16,leading=20,textColor=colors.HexColor('#29473f'),spaceBefore=18,spaceAfter=9,keepWithNext=True))
styles.add(ParagraphStyle(name='BodyCustom',fontName='Helvetica',fontSize=10.5,leading=15,textColor=colors.HexColor('#15211f'),spaceAfter=9))
def markup(s):
 s=html.escape(s).replace('→',' &gt; ').replace('≤',' &lt;= ').replace('≥',' &gt;= ').replace('×',' x ').replace('−',' - ').replace('–','-').replace('—','-').replace('’',"'").replace('“','"').replace('”','"')
 s=re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',s)
 s=re.sub(r'`([^`]+)`',r'<font name="Courier">\1</font>',s)
 return s

def footer(c,d):
 c.setStrokeColor(colors.HexColor('#52645c'));c.line(42,42,553,42)
 c.setFont('Helvetica',8);c.setFillColor(colors.HexColor('#52645c'));c.drawString(42,28,'RV / SIH 2026   |   PREPARATION - NOT SUBMISSION READY');c.drawRightString(553,28,str(d.page))
def export(source,out):
 story=[]
 for block in source.split('\n\n'):
  block=block.strip()
  if not block:continue
  if block.startswith('# '):story.append(Paragraph(markup(block[2:]),styles['TitleCustom']))
  elif block.startswith('## '):story.append(Paragraph(markup(block[3:]),styles['SectionCustom']))
  else:story.append(Paragraph(markup(block).replace('\n','<br/>'),styles['BodyCustom']))
 SimpleDocTemplate(str(out),pagesize=A4,rightMargin=44,leftMargin=44,topMargin=46,bottomMargin=58,title=out.stem,author='RV University team preparation workspace').build(story,onFirstPage=footer,onLaterPages=footer)
brief='''# From idea to evidence\n\nSIH 2026 / RV University / Preparation brief\n\n**This is not a complete competition entry.** SIH2171 has not been matched to an authoritative problem statement. No domain solution, measured impact or working domain prototype is claimed. Internal delivery target: 11 September 2026.\n\n## What exists\n\nA cited competition research base, preserved sources, 20 mandatory guardrails, 11 KPI definitions, a written design system, a responsive preparation website, a six-slide supplied-template blueprint, a separate 15-slide talk blueprint, and an execution/process record. Both presentations are editable and visibly marked not submission ready.\n\n## What the research found\n\nThe examined archives contain no exact SIH2171 match. A multi-year public archive exposed 614 yearly statement paths; absence from that sample does not prove nonexistence. Official access was partly blocked or empty. We did not substitute a similarly numbered statement.\n\nSix documented award examples span 2022-2025. Historical SIH criteria emphasize novelty, clarity, feasibility, practicability, sustainability, impact and user experience. These sources inform preparation; they are not a verified weighted SIH 2026 rubric or a model of winning.\n\nSources: https://sih.gov.in/sih2026PS ; https://sih.gov.in/letters/Guidelines-College-SPOC.pdf ; https://www.mathworks.com/academia/students/competitions/hackathons/winners.html . Detailed claim attribution and access limits are in Wiki/competition-intelligence.md and Raw/competition-sources.json.\n\n## The proposed team plan\n\nFrancis: integration and technical pitch. Gopreet: API and persistence. Hiranmayi: UX and accessibility. Varun: domain implementation. Koushaik: testing and reliability. Niharika: research and narrative.\n\nThese are proposed responsibilities, not evidence of experience or accepted commitments. Team members are second-year B.Tech CSE students at RV University according to the supplied brief. Authentic photographs, registered team details and a contact channel have not been supplied.\n\n## Build one complete journey\n\nAfter verifying the problem, choose one primary persona and three critical flows. Trace input through validation, domain processing, usable result and required persistence. Test a safe failure and recovery. A conventional web stack could use React/TypeScript, Node and SQLite or Postgres; the actual domain can invalidate that choice.\n\nFreeze scope and a deterministic dataset before testing. Document clean installation, reset, recovery, deployment and known limits. Record the real tested workflow only after implementation, then check local playback and captions.\n\n## Evidence standards\n\nAll mandatory guardrails must pass; any failed or unknown condition blocks a readiness claim. Core-flow p95 target: under 200 ms with at least 100 measured attempts after warmup. Website target: Lighthouse median above 90 in every category across mobile and desktop, using three runs each. Accessibility target: WCAG 2.1 AA with automated and manual evidence. These are targets, not domain results.\n\nMeasure functionality coverage, human flow completion, recovery, information findability and narrative coherence using frozen definitions. A judge-readiness proxy is not a persuasion probability. The probability remains null until calibrated outcome data exists. Full results and limitations belong in Benchmarks/results and Docs/verification.md.\n\n## Two presentations, two purposes\n\nThe supplied 2025 template specifies six content slides including the title and requests PDF upload. Its 2026 applicability remains unverified. The submission blueprint preserves that six-section structure. The expanded blueprint has 15 slides and a planned 700 seconds of narration plus transition time. Neither contains a completed solution or validated demo.\n\n## What unlocks the entry\n\nAn organiser-issued source must establish exact problem ID/year, full description, sponsor, category, expected outputs and constraints. Then complete domain research and competitor comparison, build and test the prototype, gather independent human feedback, populate the slides with actual evidence, confirm registration and current submission format, and rehearse.\n\nThe website is a local preparation dossier, not a public live product. No contact submissions are collected. The process document and source records explain what was built, what was checked and what remains unresolved.\n'''
(R/'Docs/preparation-brief.md').write_text(brief)
export(brief,R/'Docs/preparation-brief.pdf')
export((R/'Docs/process-documentation.md').read_text(),R/'Docs/process-documentation.pdf')
(R/'Website/downloads/preparation-brief.pdf').write_bytes((R/'Docs/preparation-brief.pdf').read_bytes())
(R/'Website/downloads/guardrails.json').write_bytes((R/'Guardrails/guardrails.json').read_bytes())
print('Exported preparation brief and process PDF; installed site downloads')
