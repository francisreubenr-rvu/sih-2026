import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('operations fixture stays synthetic and isolates the report state machine',async()=>{
 const html=await readFile(new URL('../app/operations-fixture.html',import.meta.url),'utf8');
 assert.match(html,/SIMULATION/);
 assert.match(html,/No ISRO account/);
 assert.match(html,/operations-fixture\.js/);
 const js=await readFile(new URL('../app/operations-fixture.js',import.meta.url),'utf8');
 assert.match(js,/Observation report ready/);
 assert.match(js,/report-contact/);
 assert.match(js,/dataset\.complete=matches\?'true':'false'/);
});

test('operations runner uses protected schemas, never raw text or email export',async()=>{
 const src=await readFile(new URL('../app/operations.mjs',import.meta.url),'utf8');
 assert.match(src,/requestSchema\.parse/);
 assert.match(src,/localReferenceRequestSchema\.parse/);
 assert.match(src,/createLocalValueVault/);
 assert.doesNotMatch(src,/local-email'\)\.textContent[^]*fetch\(/s); // local email is read only into the vault issuance path
 assert.match(src,/fill-local/);
});

test('operations build output exists and keeps the protected-contract stages',async()=>{
 const built=await readFile(new URL('../dist/operations.js',import.meta.url),'utf8');
 assert.ok(built.length>1000);
 for(const marker of ['draft_postcondition_verified','binding_expired_or_page_changed','fixture_exact_contact_match','/api/v2/local-plans'])assert.ok(built.includes(marker),marker);
});
