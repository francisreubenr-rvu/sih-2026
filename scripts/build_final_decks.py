#!/usr/bin/env python3
"""Generate current Sightline decks without altering historical preparation files.

Requires python-pptx, Pillow and PyMuPDF; PDF conversion requires LibreOffice.
Run: bundled-python scripts/build_final_decks.py
Then: soffice --headless --convert-to pdf --outdir Docs Docs/{submission-deck,pitch-deck}.pptx
"""
from pathlib import Path
from io import BytesIO
from zipfile import ZipFile, ZIP_DEFLATED
import json
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.oxml.xmlchemy import OxmlElement

R=Path(__file__).resolve().parents[1]
D=R/'Docs'; D.mkdir(exist_ok=True)
PAPER='F3F1E7'; INK='15211F'; LIME='D8F36A'; FOREST='29473F'; MUTED='52645C'; WHITE='FFFFFF'; CAUTION='70420B'
SW,SH=13.333333333,7.5
SRC={
 'official':'https://www.sih.gov.in/sih2026PS',
 'webpii':'https://arxiv.org/abs/2603.17357',
 'privweb':'https://arxiv.org/abs/2509.11939',
 'invisible':'https://arxiv.org/abs/2602.10139',
 'ultra':'https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB',
 'ort':'https://onnxruntime.ai/docs/get-started/with-javascript/web.html',
 'injection':'https://arxiv.org/abs/2504.11281',
}
EVID=('Benchmarks/results/operations-v01/summary.json; Benchmarks/results/operations-v01/face-scale-v01.json; '
      'Benchmarks/results/webpii-text-v01-summary.json; Benchmarks/results/prototype-unit-tests.txt')
F=['TITLE PAGE','IDEA TITLE','TECHNICAL APPROACH','FEASIBILITY AND VIABILITY','IMPACT AND BENEFITS','RESEARCH  AND REFERENCES']

def color(v):return RGBColor.from_string(v)
def shape(sl,x,y,w,h,fill=WHITE,stroke=None,kind=MSO_SHAPE.RECTANGLE):
 q=sl.shapes.add_shape(kind,Inches(x),Inches(y),Inches(w),Inches(h));q.fill.solid();q.fill.fore_color.rgb=color(fill)
 if stroke:q.line.color.rgb=color(stroke);q.line.width=Pt(.7)
 else:q.line.fill.background()
 return q
def text(sl,t,x,y,w,h,size=22,fg=INK,bold=False,font='Arial',link=None):
 q=sl.shapes.add_textbox(Inches(x),Inches(y),Inches(w),Inches(h));tf=q.text_frame;tf.clear();tf.word_wrap=True
 tf.margin_top=tf.margin_bottom=tf.margin_left=tf.margin_right=0
 for i,line in enumerate(t.split('\n')):
  p=tf.paragraphs[0] if i==0 else tf.add_paragraph();p.text=line;p.font.name=font;p.font.size=Pt(size);p.font.bold=bold;p.font.color.rgb=color(fg);p.space_after=Pt(5)
  if link:
   for run in p.runs:run.hyperlink.address=link
 return q
def line(sl,x,y,w,fg=MUTED):
 q=sl.shapes.add_connector(MSO_CONNECTOR.STRAIGHT,Inches(x),Inches(y),Inches(x+w),Inches(y));q.line.color.rgb=color(fg);q.line.width=Pt(.7)
def arrow(sl,x,y,w=.4,fg=FOREST):shape(sl,x,y,w,.26,fg,kind=MSO_SHAPE.CHEVRON)
def settext(q,t,size=22,fg=INK,bold=False):
 q.text=t;q.text_frame.word_wrap=True
 for p in q.text_frame.paragraphs:p.font.name='Arial';p.font.size=Pt(size);p.font.color.rgb=color(fg);p.font.bold=bold;p.space_after=Pt(6)
def panel(sl,x,y,w,h,label,body,tag=None,dark=False):
 shape(sl,x,y,w,h,INK if dark else WHITE)
 if tag:text(sl,tag,x+.2,y+.18,w-.4,.32,11,LIME if dark else FOREST,True)
 text(sl,label,x+.2,y+(.65 if tag else .22),w-.4,.85,25,PAPER if dark else INK,True)
 text(sl,body,x+.2,y+(1.7 if tag else 1.25),w-.4,h-(1.82 if tag else 1.37),17,PAPER if dark else MUTED)
def source(sl,label,link=None,dark=False):text(sl,label,.6,6.54,12.1,.28,11,PAPER if dark else MUTED,link=link)
def picture_crop(sl,path,x,y,w,h,crop=None):
 from PIL import Image
 im=Image.open(path); iw,ih=im.size
 if crop is None:
  frame=w/h; actual=iw/ih
  crop=(0,(1-actual/frame)/2,0,(1-actual/frame)/2) if actual<frame else ((1-frame/actual)/2,0,(1-frame/actual)/2,0)
 q=sl.shapes.add_picture(str(path),Inches(x),Inches(y),Inches(w),Inches(h));q.crop_left,q.crop_top,q.crop_right,q.crop_bottom=crop
 return q
def fresh():
 p=Presentation();p.slide_width=Inches(SW);p.slide_height=Inches(SH);return p
def base(p,n,family,title,sub,dark=False):
 s=p.slides.add_slide(p.slide_layouts[6]);s.background.fill.solid();s.background.fill.fore_color.rgb=color(INK if dark else PAPER)
 text(s,family,.6,.29,9.1,.3,11,LIME if dark else FOREST,True)
 text(s,'SIGHTLINE / SIH26171',10,.29,2.75,.3,11,PAPER if dark else INK,True)
 text(s,title,.6,.95,12.1,1.17,40,PAPER if dark else INK,True)
 text(s,sub,.63,2.48 if '\n' in title else 2.18,12,.62,18,PAPER if dark else MUTED)
 line(s,.6,6.99,12.1,FOREST if dark else MUTED)
 text(s,'RV UNIVERSITY · ENGINEERING CANDIDATE v0.1 · 11 SEP 2026',.6,7.14,10,.22,10,PAPER if dark else MUTED)
 text(s,f'{n:02d} / 15',11.9,7.14,.84,.22,10,PAPER if dark else MUTED)
 return s
NOTES=[]
def note(s,title,secs,script,refs=''):
 s.notes_slide.notes_text_frame.text=f'{title}\nPlanned duration: {secs} seconds; rehearsal not measured.\n\n{script}\n\nSources: {refs or EVID}\nEvidence date: 11 September 2026. No population accuracy or competition score is inferred from integration checks.'
 NOTES.append((title,secs,script,refs or EVID))

def submission():
 p=Presentation(R/'Raw/provided-template.pptx')
 last=p.slides._sldIdLst[-1];p.part.drop_rel(last.rId);p.slides._sldIdLst.remove(last)
 for i,s in enumerate(p.slides):
  if i:
   s.shapes[2].text=''
   settext(s.shapes[5],'SIGHTLINE\nPROJECT',11,INK,True)
   s.shapes[1].left=Inches(1.92);s.shapes[1].top=Inches(.27);s.shapes[1].width=Inches(8.55);s.shapes[1].height=Inches(.9)
   settext(s.shapes[1],F[i],27,INK,True)
  text(s,'2026 content · supplied 2025 reference format · registered team ID/name pending',.6,6.57,12.1,.28,11,CAUTION)
  s.notes_slide.notes_text_frame.text='Uses the six content slides and heading/pointer structure from Raw/provided-template.pptx; retained supplied logos are template assets, not endorsement. The user supplied a 2025 reference. Its 2026 organizer applicability and registered team ID/name still require confirmation. Sightline is a working project name. Sources: '+SRC['official']+'; '+EVID
 s=p.slides[0]
 q=s.shapes[4];q.left=Inches(.5);q.top=Inches(.16);q.width=Inches(10.1);q.height=Inches(.95);settext(q,'SMART INDIA HACKATHON 2026',29,INK,True)
 q=s.shapes[3];q.left=Inches(.55);q.top=Inches(1.18);q.width=Inches(6.5);q.height=Inches(.6);settext(q,'TITLE PAGE · SIGHTLINE',25,INK,True)
 q=s.shapes[5];q.left=Inches(.58);q.top=Inches(2.03);q.width=Inches(6.72);q.height=Inches(4.37)
 settext(q,'Problem Statement ID – SIH26171\nProblem Statement Title – On-device Visual Perception for Light-weight Browser Agents\nTheme – Smart Automation\nPS Category – Software\nTeam ID – pending registration detail\nTeam Name (Registered on portal) – pending\nRV University · Gopreet, Hiranmayi, Varun, Koushaik, Francis, Niharika',19)
 s=p.slides[1]
 text(s,'Proposed Solution (Describe your Idea/Solution/Prototype)',.6,1.54,12,.35,14,FOREST,True)
 text(s,'Keep the screen local. Send a protected layout. Review every action.',.6,1.98,12,.8,27,INK,True)
 for x,label,body in [(.6,'Detailed explanation of the proposed solution','Local face CV + DOM bounds → opaque regions and approved controls → Qwen2.5 → reviewed action.'),(4.77,'How it addresses the problem','A strict pixel-free request excludes source text, images, values and URLs before server reasoning.'),(8.94,'Innovation and uniqueness of the solution','Inspectable egress + expiring action references. Integration difference; no first-ever privacy claim.')]:
  text(s,label,x,3.08,3.78,.87,14,FOREST,True);text(s,body,x,4.12,3.78,1.8,22)
 s=p.slides[2]
 text(s,'Technologies to be used (e.g. programming languages, frameworks, hardware)',.6,1.52,12,.35,14,FOREST,True)
 text(s,'JavaScript / extension · UltraFace RFB-320 + ONNX WASM · Node.js / Zod\nOllama + Qwen2.5:7B · SQLite audit counts',.6,1.98,12,1.0,23)
 text(s,'Methodology and process for implementation (Flow Charts/Images/ working prototype)',.6,3.15,12,.35,14,FOREST,True)
 for x,t,b in [(.6,'Capture','Local only'),(3.73,'Protect','Typed scene'),(6.86,'Reason','Server LLM'),(9.99,'Confirm','Local action')]:
  shape(s,x,3.75,2.69,1.29,PAPER,FOREST);text(s,t,x+.16,3.97,2.37,.4,24,INK,True);text(s,b,x+.16,4.55,2.37,.3,17,MUTED)
 for x in [3.35,6.48,9.61]:arrow(s,x,4.26,.24)
 text(s,'Observed: Pending → Review → Request ready for review (synthetic fixture).\nCurrent LLM reads protected geometry/labels, not PNG pixels; native extension QA pending.',.6,5.46,12,.9,20)
 s=p.slides[3]
 for y,label,body in [(1.55,'Analysis of the feasibility of the idea','Local browser + Qwen workflow observed; 75 recorded Node tests pass.\nSingle desktop observation: capture 92 ms; face inference 9.6 ms.'),(3.12,'Potential challenges and risks','Real model step: 3,029 ms; full-flow <200 ms target fails.\nFace-only CV; context removal costs utility; no dataset PII accuracy yet.'),(4.7,'Strategies for overcoming these challenges','Measure detection/utility on labeled held-out pages; profile cold/warm costs.\nFail closed on CV errors; explicit action review; expiry and schema checks.')]:
  text(s,label,.6,y,12,.33,14,FOREST,True);text(s,body,.6,y+.45,12,1.03,23)
 s=p.slides[4]
 text(s,'Potential impact on the target audience',.6,1.53,12,.35,14,FOREST,True)
 text(s,'Help users complete browser tasks with less raw screen exposure.',.6,1.98,12,.7,29,INK,True)
 text(s,'Benefits of the solution (social, economic, environmental, etc.)',.6,2.96,12,.35,14,FOREST,True)
 for x,label,body in [(.6,'User control','Inspect server-bound context; approve a bounded action.'),(4.77,'Deployable locally','Existing laptop + local model; offline operation after assets are installed.'),(8.94,'Measure the trade-off','PII coverage vs useful context; task success; latency and client memory.')]:
  text(s,label,x,3.58,3.78,.7,24,INK,True);text(s,body,x,4.43,3.78,1.5,22)
 text(s,'Expected benefits, not achieved impact. No user study, savings or energy reduction is claimed.',.6,6.12,12,.3,14,CAUTION)
 s=p.slides[5]
 text(s,'Details / Links of the reference and research work',.6,1.48,12,.35,14,FOREST,True)
 refs=[('Official SIH26171 · problem and 25/20/20/20/15 weights',SRC['official']),('WebPII / WebRedact · visual PII benchmark (2026 preprint)',SRC['webpii']),('PrivWeb · local anonymization and user control (2025 preprint)',SRC['privweb']),('Available but Invisible · typed placeholders (2026 preprint)',SRC['invisible']),('UltraFace · MIT model; ORT Web · packaged WASM runtime',SRC['ultra'])]
 for i,(label,url) in enumerate(refs):
  y=2.06+i*.77;text(s,label,.6,y,12,.33,18,INK,True);text(s,url,.6,y+.36,12,.29,13,FOREST,link=url)
 text(s,'Prototype evidence: Benchmarks/results/prototype-v01-browser.json · model hashes/licenses in Prototype/models/manifest.json',.6,6.07,12,.38,12,MUTED)
 p.core_properties.title='Sightline | SIH26171 | Six-slide submission candidate'
 p.save(D/'submission-deck.pptx')
 assert len(p.slides)==6

def talk():
 p=fresh()
 s=base(p,1,F[0],'Let the agent see\nwhat it needs.','Sightline · On-device Visual Perception for Light-weight Browser Agents',True)
 shape(s,.62,3.54,8.04,2.24,LIME)
 text(s,'Local perception.\nA smaller privacy boundary.',.87,3.9,7.55,1.42,32,INK,True)
 text(s,'SIH26171\nISRO · Smart Automation\nSoftware',9.16,3.87,3.54,1.58,22,PAPER)
 source(s,'Working project name · RV University · Registered team ID/name pending',dark=True)
 note(s,'1 · Sightline',20,'Sightline is our working response to SIH26171: on-device visual perception for lightweight browser agents. The central idea is simple: the browser retains the original screen, constructs a protected description and sends only that description to a reasoning server. The user then reviews a bounded action before it executes. This is an implemented engineering candidate, with its limits visible.',SRC['official'])
 s=base(p,2,F[1],'A screen contains more than a task.','The same view can expose identity, account information, a password field and useful controls.')
 for x,label,body,fill in [(.62,'Sensitive context','Face · account · form values',WHITE),(4.78,'Useful structure','Geometry · approved controls',LIME),(8.94,'Agent task','Find a pending request',WHITE)]:
  shape(s,x,3.43,3.76,2.34,fill);text(s,label,x+.2,3.68,3.35,.8,26,INK,True);text(s,body,x+.2,4.71,3.35,.8,21,MUTED)
 source(s,'Problem basis: SIH26171. UI PII coverage is an active research problem: WebPII (2026 preprint).',SRC['webpii'])
 note(s,'2 · The privacy conflict',45,'A browser agent needs enough context to decide what to do, but a screenshot may contain more than the task requires. A service screen can include a face, account number, partially filled form and password field beside an ordinary Pending button. The organizer asks us to separate those two needs locally. WebPII reinforces why simple password masking is insufficient: screenshot PII has many forms. We use an explicitly synthetic service desk to demonstrate the boundary without testing on a real account. The real challenge is preserving enough useful context to complete a task while measuring what sensitive content is removed.',SRC['official']+'; '+SRC['webpii'])
 s=base(p,3,F[1],'Optimize the real judging dimensions.','Organizer weights guide the evaluation plan. They are not our scores.')
 for i,(label,v) in enumerate([('Visual-context accuracy',25),('PII recall and precision',20),('Redaction precision',20),('Client resource use',20),('Overall task latency',15)]):
  y=3.12+i*.59;text(s,label,.63,y,4.38,.35,20,INK,True);shape(s,5.22,y+.05,v*.235,.25,FOREST);text(s,f'{v}%',11.57,y,.9,.4,21,INK,True)
 source(s,'Official weights: SIH 2026 catalogue. Complete scoring formulas are not supplied.',SRC['official'])
 note(s,'3 · Evaluation contract',45,'The official statement allocates twenty-five percent to visual-context accuracy; twenty percent each to PII detection, redaction precision and client resource use; and fifteen percent to overall task latency. These are organizer weights, not measured scores for Sightline. They make the trade-off explicit: removing everything may control exposure while failing utility. We therefore need separate detection, redaction and task-success measurements. The organizer has not published complete normalization formulas, so we will not invent a weighted total. Current integration observations are useful for debugging, but they cannot stand in for dataset accuracy or a predicted jury outcome.',SRC['official']+'; Benchmarks/official-rubric.json')
 s=base(p,4,F[2],'The privacy decision stays in the browser.','Actual v0.1 flow: local CV + DOM → protected scene → server reasoning → reviewed local action.')
 for x,label,body in [(.62,'Capture','Screen remains local'),(3.76,'Protect','CV + strict scene'),(6.9,'Reason','Qwen2.5 server'),(10.04,'Confirm','Validated action')]:
  shape(s,x,3.39,2.65,1.77,WHITE);text(s,label,x+.18,3.64,2.29,.5,25,INK,True);text(s,body,x+.18,4.37,2.29,.6,18,MUTED)
 for x in [3.35,6.49,9.63]:arrow(s,x,4.12,.29)
 shape(s,.62,5.65,5.61,.52,LIME);text(s,'BROWSER · raw capture never enters the plan request',.82,5.78,5.21,.27,13,INK,True)
 text(s,'Only protected geometry / labels cross the API.',6.92,5.73,5.75,.6,18,FOREST,True)
 source(s,'Implementation: Prototype/README.md · server LLM consumes layout data, not image pixels.')
 note(s,'4 · Architecture',55,'The application captures the local fixture and runs an actual UltraFace model through ONNX Runtime Web. DOM bounds and local detections inform an opaque reconstruction. A strict scene schema then allows only approved control labels, geometry and region kinds into the plan request. A separate Ollama process runs Qwen2.5 and proposes a click, scroll or done action. Before execution, the client checks that the plan matches the current revision and requires the user to confirm. This is not a vision-language model reading a PNG: the current server reasons over protected layout data. That constraint keeps the boundary inspectable, while deliberately reducing the context available to the model.','Prototype/README.md; CONTEXT.md; Docs/decisions/local-vision.md')
 s=base(p,5,F[2],'Inspect exactly what the agent receives.','Actual synthetic-demo capture. The protected view removes original text and media.')
 shot=D/'prototype-full-v02.png'
 if not shot.exists():shot=D/'prototype-viewport-v01.png'
 # Embedded browser full-page output contains extra blank area; use the observed panel bounds only.
 crop=(.025,.1325,.525,.7275) if shot.name=='prototype-full-v02.png' else None
 picture_crop(s,shot,1.2,3.02,6.63,3.19,crop)
 text(s,'Original screen\nstays local.',9.3,3.27,3.36,.99,29,INK,True)
 text(s,'Approved controls survive.\nUnknown text and pixels\nbecome opaque regions.',9.3,4.64,3.36,1.3,21,MUTED)
 source(s,'Screenshot: delivered local build, 9 Sep 2026. Synthetic account; NASA reference image, not team portrait.')
 note(s,'5 · Protected preview',45,'This is a real screenshot of the delivered synthetic demo. The left side is the source fixture, and the right side is the protected reconstruction. The synthetic account label, number, password field and reference portrait do not become part of the raw plan request. The approved navigation controls remain usable. This design does not claim that the face detector discovers every sensitive region. Unknown material is excluded independently, and face output never authorizes sending original image pixels. The preview lets the user inspect the remaining disclosure, including layout geometry, before asking the model. A synthetic example establishes integration, not a general privacy guarantee.',EVID+'; Prototype/models/manifest.json')
 s=base(p,6,F[2],'Small model. Real local inference.','UltraFace RFB-320 runs in packaged ONNX Runtime Web 1.23.2, single-thread WASM.')
 panel(s,.62,3.08,3.76,3.01,'320 × 240','RGB → (value − 127) / 128\nNCHW float32 tensor','MODEL INPUT')
 panel(s,4.78,3.08,3.76,3.01,'1.26 MB','Optimized model bytes\nRuntime adds ≈11.98 MB','ASSETS · DECIMAL MB')
 panel(s,8.94,3.08,3.76,3.01,'Face-only','Not OCR or general PII\nErrors block preparation','DETECTION LIMIT')
 source(s,'Model/runtime manifest records exact bytes, hashes and MIT licenses. No browser CDN.',SRC['ultra'])
 note(s,'6 · Local perception',45,'The browser inference is real, not a mocked detection. We use the upstream RFB-320 face model with the documented RGB resize, normalization and NCHW tensor order. The locally packaged optimized model is approximately one point two six decimal megabytes. The generic WASM runtime adds almost twelve megabytes, so model size alone understates cold-load cost. The model and runtime licenses and hashes are recorded. A confidence threshold and non-maximum suppression determine the returned boxes, but those settings have not been optimized on a held-out dataset. This is a face-only detector. Text PII requires other mechanisms; initialization or inference failure blocks context preparation.',SRC['ultra']+'; '+SRC['ort']+'; Prototype/models/manifest.json; Docs/decisions/local-vision.md')
 s=base(p,7,F[2],'A typed boundary is easier to audit.','The outgoing plan request has an allowlist; original screen content has no payload field.')
 shape(s,.62,3.11,6.09,3.15,INK)
 text(s,'ALLOWED CONTEXT',.88,3.38,5.6,.36,13,LIME,True)
 text(s,'revision + viewport\napproved control IDs / labels\nbounded geometry\nopaque region kinds',.88,4.02,5.53,1.95,23,PAPER,font='Courier New')
 text(s,'Excluded',7.34,3.28,5.25,.52,28,INK,True)
 text(s,'Raw screenshots / DOM\nAccount and field values\nSource URLs / arbitrary text\nCredentials',7.34,4.04,5.22,1.98,23,MUTED)
 source(s,'Observed payload excluded fixture email, account number and image data at 390px. One synthetic fixture.')
 note(s,'7 · Egress contract',50,'Our main privacy control is the outgoing data contract. It has fields for a revision, viewport, bounded control geometry, approved labels and opaque region kinds. It has no raw screenshot, DOM dump, field-value or source-URL field. Extra fields and malformed geometry are rejected. In the recorded mobile check, the synthetic email, account number and image data were absent from the payload. That is a specific observation on one fixture, not proof against every encoding or page. Layout still reveals structure, and approved labels reveal a restricted vocabulary. We make that residual exposure inspectable and need adversarial testing before broadening the allowed context.','Prototype/README.md; '+EVID)
 s=base(p,8,F[2],'A model proposal is not execution authority.','Every action must match the live scene and survive local validation.')
 for x,n,t in [(.62,'01','Capture revision'),(3.76,'02','Validate proposal'),(6.9,'03','User confirms'),(10.04,'04','Recheck target')]:
  shape(s,x,3.46,2.65,1.79,WHITE);text(s,n,x+.18,3.68,2.28,.4,18,FOREST,True);text(s,t,x+.18,4.26,2.28,.75,23,INK,True)
 for x in [3.35,6.49,9.63]:arrow(s,x,4.17,.29)
 text(s,'Allowed: click / scroll / done.  No arbitrary URL, typing, script or submission.',.63,5.78,12,.52,20,FOREST,True)
 source(s,'30-second capture expiry; delayed action rejected in the recorded workflow. Prompt-injection safety is not complete.')
 note(s,'8 · Reviewed action',45,'The server does not receive authority to execute arbitrary instructions. It returns a small action vocabulary, and a click must identify a currently approved target. The client binds that proposal to the captured revision, expires it after thirty seconds and rechecks the target when the user confirms. A delayed confirmation was rejected in the actual workflow, and the app later disabled plan and execute controls proactively after expiry. Typing, arbitrary navigation, executable code and irreversible submissions are outside the current scope. These checks reduce the attack surface. They do not establish complete prompt-injection safety, especially as page coverage expands.',EVID+'; '+SRC['injection'])
 s=base(p,9,F[2],'One complete task, with a real model.','Observed synthetic workflow: open Pending, then Review. No external account or form submission.')
 for x,label,body in [(.62,'Requests','Capture → Qwen → confirm'),(4.78,'Pending requests','Recapture → Qwen → confirm'),(8.94,'Ready for review','Correct fixture end-state')]:
  shape(s,x,3.43,3.76,2.28,LIME if x>8 else WHITE);text(s,label,x+.2,3.7,3.35,.85,26,INK,True);text(s,body,x+.2,4.77,3.35,.77,19,MUTED)
 text(s,'Demo fallback: local screenshots available. Screen-recording playback remains a separate delivery check.',.63,6.04,12,.36,16,CAUTION)
 source(s,'Recorded manual integration: actual qwen2.5:7b-instruct on Ollama, not provider test doubles.')
 note(s,'9 · Demonstration',75,'For the live demonstration, choose Review a pending request, then capture and protect. Point out the protected preview and the outgoing request before asking the local model. Confirm the proposed Pending action. The fixture enters Pending requests. Capture the new scene, request another plan and confirm Review. The verified end-state is Request ready for review. This exact sequence was observed with the real Qwen2.5 model. During an earlier attempt, waiting too long caused the second action to expire; recapture restored the valid path. Reserve roughly thirty seconds here for the actual operations. If the live path is unavailable, show the recorded evidence honestly. At the time of these source records, screenshots exist and screen-recording playback has not been verified.',EVID+'; Prototype/README.md')
 s=base(p,10,F[3],'Fast perception. Slower reasoning.','Single integration observations on Apple M1 Pro / 16 GB / embedded Chromium. Not p95.')
 for x,value,label in [(.62,'9–20 ms','Face inference, 14 input sizes'),(4.78,'92–108 ms','Capture + protection'),(8.94,'3,029 ms','First real model step')]:
  text(s,value,x,3.4,3.76,.83,42,INK,True);text(s,label,x,4.44,3.76,.67,22,MUTED);line(s,x,5.4,3.76)
 text(s,'75 recorded Node tests pass. The <200 ms full-flow target does not pass.',.63,5.89,12,.47,23,CAUTION,True)
 source(s,'Face-inference range: 11 Sep 2026 face-scale matrix. Capture and model figures: 9 Sep 2026 v0.1 record. Test doubles are unit-test scope; the Qwen workflow is separate evidence.')
 note(s,'10 · Measured limits',60,'The measurement story needs precision. A scale matrix ran the packaged face model over one synthetic image at fourteen sizes from forty-eight to three hundred and twenty pixels: every size returned one detection, between nine and twenty milliseconds. Capture and protection measured ninety-two to one hundred and eight milliseconds across the recorded desktop, initial and narrow-viewport captures. An integrated synthetic observation desk completed a local draft in thirty point five seconds including the human confirmation step, and two further runs stopped correctly on expiry and on user request. A separate first live model step displayed three thousand and twenty-nine milliseconds. One result went against us and it is on the slide: on one hundred frozen synthetic screens, local OCR and the PII model retained exact annotated personal data on fifty-eight of them. That is why text export stays disabled and the outbound schema stays structural. These are local observations on an Apple M1 Pro with sixteen gigabytes of system memory, not distributions or a mobile benchmark. Seventy-five recorded Node tests pass. The original two-hundred-millisecond full-flow target is failed, and we are not rebranding the fastest component as the whole pipeline.',EVID)
 s=base(p,11,F[3],'Build on prior work, then test the difference.','Privacy filtering is established. Our claim is an inspectable browser integration, not invention of anonymization.')
 for i,(name,overlap,difference) in enumerate([('WebPII / WebRedact','UI PII detection + benchmark','Browser cost and action-boundary tests pending'),('PrivWeb','Local anonymization + user control','Explicit pixel-free egress + expiring controls'),('Available but Invisible','Typed placeholders + secure proxy','Browser implementation and packaging')]):
  y=3.17+i*.93;line(s,.63,y,12.04);text(s,name,.63,y+.17,3.8,.53,22,INK,True);text(s,overlap,4.71,y+.18,3.65,.58,18,MUTED);text(s,difference,8.65,y+.18,4.0,.63,18,FOREST)
 source(s,'Primary preprints: arXiv 2603.17357 · 2509.11939 · 2602.10139. No head-to-head accuracy study.',SRC['webpii'])
 note(s,'11 · Competitive position',45,'Three adjacent research efforts define the comparison. WebPII and WebRedact address visual PII and benchmark design. PrivWeb investigates local anonymization and user control. Available but Invisible uses typed placeholders and a secure interaction proxy. We therefore cannot claim to be the first private browser agent or to invent local filtering. Our engineering focus is the combination of a packaged browser model, an explicit pixel-free request schema and expiring reviewed controls. That combination exists in our prototype; comparative accuracy and broader utility are still unmeasured. A fair next evaluation uses the same tasks and annotations across baselines and reports both sensitive coverage and useful context retained.',SRC['webpii']+'; '+SRC['privweb']+'; '+SRC['invisible']+'; Wiki/competitors.md')
 s=base(p,12,F[3],'The strict boundary has a utility cost.','Removing unknown text and images is conservative. It can also remove the answer.')
 panel(s,.62,3.1,3.76,3.0,'Known limits','Face-only model\nRestricted task vocabulary\nLLM reads layout, not PNG','CURRENT')
 panel(s,4.78,3.1,3.76,3.0,'Validate next','Chrome + Firefox extension\nLabeled unseen pages\nAccessibility and user review','OPEN')
 panel(s,8.94,3.1,3.76,3.0,'Improve carefully','Compare DOM / CV baselines\nWorker and cold-load profile\nAdd context only with evidence','ROADMAP')
 source(s,'These are explicit limitations and planned work. No broad PII, WCAG or extension conformance claim.')
 note(s,'12 · Risks and mitigation',40,'Two risks are measured rather than assumed. First, the conservative reconstruction is a deliberate trade-off. It limits what enters the server request, but useful text and images can disappear as well. A face-only model may miss small or occluded faces, and it cannot recognize textual PII. The current workflow is restricted, while native Chrome and Firefox extension execution remains a separate verification gate. Next, freeze labeled unseen pages and compare DOM-only, face-only, detected masks and conservative reconstruction. Measure preservation as well as removal. Second, and more serious: on one hundred frozen synthetic screens, local OCR and the PII model retained exact annotated personal data on fifty-eight of them. That is a failed privacy result, and it is why text export remains disabled and the outbound request schema stays structural rather than carrying reconstructed text. Then profile worker execution and cold loading. Any broader vocabulary or image context should be admitted only after its privacy and task utility are evaluated.','Prototype/README.md; Wiki/domain-research.md; Docs/decisions/local-vision.md')
 s=base(p,13,F[4],'Measure benefit at the task boundary.','Proposed pilot outcomes, not achieved social impact or a validated business model.')
 for x,label,body in [(.62,'User control','Comprehension of preview\nReview burden\nTask completion'),(4.78,'Operating viability','Existing-device deployment\nCost per completed task\nMaintainer responsibility'),(8.94,'Privacy / utility','Sensitive coverage\nUseful context retained\nFailure severity')]:
  text(s,label,x,3.35,3.75,.8,28,INK,True);line(s,x,4.31,3.76);text(s,body,x,4.64,3.75,1.5,22,MUTED)
 source(s,'A local-install institutional pilot is a proposed route. No partner, revenue, savings or energy benefit is asserted.')
 note(s,'13 · Impact and sustainability',45,'The intended benefit is not a large user counter. It is a completed task with an understandable disclosure decision. A pilot should measure whether users understand the preview, how much review effort it adds and how often they reach the correct end-state. Operating viability requires the model and browser assets, support ownership and a cost per completed task. Deployment on existing hardware is possible in the demonstrated setup, but it does not automatically imply energy savings. An institutional local-install pilot is a proposed route, not an agreed partnership or validated revenue model. Privacy coverage and useful context must be evaluated together, with failure severity recorded.','Prototype/README.md; Wiki/domain-research.md; authored pilot proposal')
 s=base(p,14,F[4],'Six owners. One accountable demo.','Responsibilities are proposed work allocation; no individual experience or awards are invented.')
 team=[('Francis','Integration + technical pitch'),('Gopreet','API + persistence'),('Hiranmayi','UX + accessibility'),('Varun','Domain implementation'),('Koushaik','Testing + reliability'),('Niharika','Research + narrative')]
 for i,(name,role) in enumerate(team):
  x=.63+(i%3)*4.16;y=3.02+(i//3)*1.13;line(s,x,y,3.75);text(s,name,x,y+.15,3.75,.42,25,INK,True);text(s,role,x,y+.67,3.75,.36,18,MUTED)
 shape(s,.63,5.65,12.07,.63,LIME);text(s,'09 SEP  Build evidence    →    10 SEP  Validate + rehearse    →    11 SEP  Internal delivery',.83,5.85,11.67,.31,16,INK,True)
 source(s,'User-supplied team names and institution. Registered team name/ID and consented portraits remain pending.')
 note(s,'14 · Team and delivery',55,'The six team members are second-year B.Tech CSE students at RV University, as supplied in the brief. These roles are proposed ownership rather than evidence of prior expertise. Francis integrates the build and technical pitch; Gopreet owns API and persistence; Hiranmayi owns UX and accessibility; Varun owns domain implementation; Koushaik owns testing and reliability; and Niharika owns research and narrative. Each contribution should be linked to a real artifact before rehearsal. The internal target is eleven September, separate from the catalogue’s displayed date. The next checkpoint is validation and a timed run, with optional scope cut before correctness or evidence. Registered team details and consented portraits still need to be supplied.','Docs/team-plan.md; user brief; current PLAN.md')
 s=base(p,15,F[5],'Useful context.\nA smaller exposure.','Sightline demonstrates a reviewed browser-agent loop; evaluation determines how far it can go.',True)
 shape(s,.63,3.55,12.07,1.22,LIME);text(s,'Next decision: test the boundary on held-out tasks.',.9,3.88,11.54,.68,32,INK,True)
 text(s,'Inspect the context. Challenge the action. Measure the trade-off.',.64,5.4,12,.66,27,PAPER,True)
 source(s,'Run locally: Prototype/README.md · Evidence: Benchmarks/results/ · Source ledger: Wiki/source-index.md',dark=True)
 note(s,'15 · Closing and next decision',30,'Sightline already connects real browser-local inference, a protected scene, a real reasoning model and a reviewed action on a synthetic task. Its current result is an inspectable engineering boundary, not a promise of zero leakage or universal automation. The next decision is to evaluate that boundary on held-out tasks and measure what is protected, what remains useful and what it costs. We invite evaluation of the demonstrated mechanism and its explicit limits. The complete source and evidence registers travel with the build.','Wiki/source-index.md; '+EVID)
 assert len(p.slides)==15
 p.core_properties.title='Sightline | SIH26171 | 15-slide technical pitch'
 p.core_properties.subject='Implemented candidate with measured integration evidence and explicit limits'
 p.save(D/'pitch-deck.pptx')

def template():
 p=fresh()
 for i,heading in enumerate(F):
  s=p.slides.add_slide(p.slide_layouts[1]);s.background.fill.solid();s.background.fill.fore_color.rgb=color(PAPER)
  title=s.shapes.title;title.left=Inches(.62);title.top=Inches(1);title.width=Inches(12.05);title.height=Inches(1.1);settext(title,heading,38,INK,True)
  body=s.placeholders[1];body.left=Inches(.65);body.top=Inches(2.65);body.width=Inches(11.7);body.height=Inches(3.5)
  settext(body,'Replace with one evidence-backed assertion.\nAdd a diagram, result or screenshot of the actual build.\nLabel measured results, external facts and projections separately.\nAdd the source URL and measurement conditions in notes.',24,MUTED)
  shape(s,.62,.42,1.0,.12,LIME);text(s,'SIGHTLINE · EDITABLE PRESENTATION TEMPLATE',1.85,.28,10.7,.34,11,FOREST,True)
  line(s,.62,6.8,12.05);text(s,'Source / date / evidence scope → replace before presenting',.62,7.05,12,.3,12,MUTED)
  s.notes_slide.notes_text_frame.text='Reusable template. Title and content are genuine PowerPoint placeholders. Open this POTX to create a new presentation, replace placeholder content, then Save As PPTX. This original design template is not the official SIH portal template; use submission-deck.pptx for the supplied-format candidate. Never delete evidence limitations until verified. Change colors/fonts consistently through the theme or selected shapes.'
 p.core_properties.title='Sightline | Reusable editorial template'
 buf=BytesIO();p.save(buf);out=BytesIO()
 with ZipFile(buf) as zin,ZipFile(out,'w',ZIP_DEFLATED) as zout:
  for item in zin.infolist():
   b=zin.read(item.filename)
   if item.filename=='[Content_Types].xml':b=b.replace(b'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',b'application/vnd.openxmlformats-officedocument.presentationml.template.main+xml')
   zout.writestr(item,b)
 (D/'sightline-template.potx').write_bytes(out.getvalue())

submission();talk();template()
total=sum(n[1] for n in NOTES)
lines=['# Sightline — 15-slide speaker notes','',f'Planned talk slots: {total} seconds ({total//60}m {total%60}s). Approximately 12 minutes; not a measured rehearsal. Allow operator time on slide 9. Sources and limitations are retained in the PPTX notes.','',
 '## Files and template use','',
 '- `submission-deck.pptx/pdf`: six content slides derived from the supplied 2025 reference. Registered team details and current organizer-format applicability remain open. Sightline is the working project name.',
 '- `pitch-deck.pptx/pdf`: separate 15-slide technical talk; it is not the six-slide portal submission.',
 '- `sightline-template.potx`: open in PowerPoint to create a new presentation. Replace its title/content placeholders, preserve evidence labels, and save the new file as PPTX. Editing a POTX does not automatically update presentations already created from it. The reusable visual template is an original design, not an organizer-issued template.',
 '', '## Evidence discipline','',
 'Every timing on these slides is a single local observation on Apple M1 Pro / 16 GB, not a p95, dataset accuracy or cross-browser certification. The 9-20 ms face-inference range comes from the 11 September face-scale matrix; the 92-108 ms capture-and-protection range and the 3,029 ms first-model-step figure come from the 9 September v0.1 record. Seventy-five tests is the recorded count at deck generation, not a promise that future revisions retain it.',
 'The 58-of-100 retained-PII figure is a failed privacy result on frozen synthetic screens. It is published deliberately and it constrains the product: text export stays disabled and the outbound request carries structure rather than reconstructed text. The full-flow 200 ms guardrail remains failed. Future measurements must replace these only with traceable new evidence.','']
for title,secs,script,refs in NOTES:lines += ['## '+title,'',f'**Timing: {secs} seconds**','',script,'','Sources: '+refs,'']
(D/'pitch-speaker-notes.md').write_text('\n'.join(lines))
print(json.dumps({'submissionSlides':6,'talkSlides':15,'talkPlannedSeconds':total,'templateSlides':6,'outputs':['submission-deck.pptx','pitch-deck.pptx','sightline-template.potx','pitch-speaker-notes.md']}))
