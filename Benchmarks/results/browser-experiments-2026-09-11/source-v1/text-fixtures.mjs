// Authored synthetic development fixtures. Not real people or a held-out dataset.
export const textFixtures=[
 {id:'contact-record',title:'Contact details',lines:[['Name: Alex Morgan',['Alex','Morgan']],['Email: alex@example.test',['alex@example.test']],['Phone: 202-555-0147',['202-555-0147']],['Status: Pending',[]],['Review Details Next',[]]]},
 {id:'delivery-record',title:'Delivery request',lines:[['Recipient: Taylor Smith',['Taylor','Smith']],['Address: 42 Example Street',['42','Example','Street']],['City: Springfield',['Springfield']],['Status: Completed',[]],['Previous Review Help',[]]]},
 {id:'mixed-context',title:'Account review',lines:[['Customer: Jordan Lee',['Jordan','Lee']],['Password: DemoSecret42!',['DemoSecret42!']],['Account: 123456789012',['123456789012']],['Request: Update preferences',[]],['Back Cancel Search',[]]]}
];
export function drawTextFixture(canvas,fixture){
 canvas.width=1000;canvas.height=560;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1000,560);ctx.textBaseline='top';ctx.fillStyle='#172b24';ctx.font='bold 30px sans-serif';ctx.fillText(fixture.title,48,32);ctx.font='26px sans-serif';
 const expected=[];
 fixture.lines.forEach(([text,pii],row)=>{let x=48;const y=120+row*72;for(const word of text.split(' ')){const width=ctx.measureText(word).width;ctx.fillText(word,x,y);expected.push({text:word,pii:pii.includes(word),rect:{x,y,width,height:32}});x+=width+ctx.measureText(' ').width;}});
 return expected;
}
export function scoreTextFixture(expected,words){
 // Word recognition is matched geometrically, then checked for full expected token text.
 const normalize=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
 const assessments=expected.map(e=>{
  const overlaps=words.filter(w=>{const r=w.rect,cx=r.x+r.width/2,cy=r.y+r.height/2;return cx>=e.rect.x&&cx<=e.rect.x+e.rect.width&&cy>=e.rect.y&&cy<=e.rect.y+e.rect.height;});
  const recognized=normalize(overlaps.map(w=>w.text).join(''))===normalize(e.text);
  const detected=recognized&&overlaps.some(w=>w.sensitive);
  const retained=recognized&&overlaps.every(w=>!w.sensitive&&w.confidence>=70);
  return {...e,recognized,detected,retained};
 });
 const pii=assessments.filter(x=>x.pii),useful=assessments.filter(x=>!x.pii);
 return {scope:'authored token diagnostic; not entity-level benchmark',piiTokens:pii.length,piiDetected:pii.filter(x=>x.detected).length,piiRetained:pii.filter(x=>x.retained).length,usefulTokens:useful.length,usefulRetained:useful.filter(x=>x.retained).length,assessments};
}
