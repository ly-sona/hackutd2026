// @vitest-environment node
import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { analyzeSnapshot,canonical,type SnapshotInput,type SourceRecord } from '../../shared/investigation';
import type { AgentObservation,Citation } from '../../shared/agent-investigation';
import { deriveImpactCandidates } from '../../shared/investigation-impact';
function data(){const observations:AgentObservation[]=[],records=new Map<string,SourceRecord>();
 for(const id of ['customers','identity','network','services']){const versions=[0,1].map(v=>JSON.parse(readFileSync(resolve(process.cwd(),`../mock-evidence/connectors/${id}-${v}.json`),'utf8')) as SnapshotInput);
  for(const [index,o]of analyzeSnapshot(versions[0],versions[1]).observations.entries()){
   const provenance=versions.flatMap((s,v)=>{const i=s.records.findIndex(r=>r.key===o.key);if(i<0)return[];const r=s.records[i],snapshotId=`${id}-${v}`;records.set(`${snapshotId}:${r.key}`,r);return[{evidenceId:`EV-${snapshotId}`,snapshotId,key:r.key,location:`/records/${i}`,fields:o.fields,observedAt:r.observedAt,ruleVersion:'aegis-deterministic-v1',recordHash:createHash('sha256').update(canonical(r)).digest('hex')}];});
   observations.push({id:`${id}-${index}`,sourceId:`acme:IR-test:source:${id}`,key:o.key,rule:o.rule,ruleVersion:'aegis-deterministic-v1',description:o.description,provenance:JSON.stringify(provenance)});
  }
 }
 const read=(c:Citation)=>records.get(`${c.snapshotId}:${c.key}`)!;
 return{observations,records,derive:(obs=observations)=>deriveImpactCandidates(obs,read,'acme:IR-test')};
}
describe('independent evidence-derived impact candidates',()=>{
 it('uses five supported existing Phase 3 dimensions from actual P0 bytes',()=>{const {derive}=data();const candidates=derive();expect(new Set(candidates.map(c=>c.dimension))).toEqual(new Set(['Alteration','Deletion','Exfiltration','Availability','Compromise']));expect(candidates.every(c=>!c.proposedStatus.startsWith('Confirmed'))).toBe(true);expect(candidates.every(c=>c.citations.length&&c.observationIds.length&&c.toolVersion==='aegis-impact-v1')).toBe(true);});
 it('targets the changed imported customer record while retaining cause and baseline uncertainty',()=>{const c=data().derive().find(c=>c.dimension==='Alteration')!;expect(c.entityId).toBe('acme:IR-test:source:customers:record:C-1044');expect(c.claim).toContain('unverified');expect(c.proposedStatus).toBe('Suspected');expect(c.citations.map(c=>c.fields)).toContainEqual(['contact_email']);});
 it('does not produce an alteration proposal for a source-declared approved change',()=>{expect(data().derive().filter(c=>c.dimension==='Alteration').some(c=>c.targetLabel.includes('C-1045'))).toBe(false);});
 it('keeps missing export deletion unassessed and targets only an existing dataset',()=>{const c=data().derive().find(c=>c.dimension==='Deletion')!;expect(c.entityId).toBe('acme:IR-test:source:customers:dataset');expect(c.proposedStatus).toBe('Unassessed');expect(c.claim).toContain('not established');expect(c.uncertainty).toContain('coverage');});
 it('never derives encryption from a ransomware label or absent file-state indicators',()=>{expect(data().derive().filter(c=>c.dimension==='Encryption')).toEqual([]);});
 it('requires identity correlation for an exposure candidate and never targets a customer dataset or record',()=>{const d=data();const c=d.derive().find(c=>c.dimension==='Exfiltration')!;expect(c.entityId).toBe('acme:IR-test:source:network:system');expect(c.observationIds).toHaveLength(2);expect(c.uncertainty).toContain('No dataset or individual record');expect(d.derive(d.observations.filter(o=>o.rule!=='new-signin-source')).some(c=>c.dimension==='Exfiltration')).toBe(false);});
 it('does not correlate mismatched accounts into exposure',()=>{const d=data();d.records.get('identity-1:AUTH-002')!.fields.accountId='different';expect(d.derive().some(c=>c.dimension==='Exfiltration')).toBe(false);});
 it('keeps reported availability and new-source access independent from confirmed compromise',()=>{const candidates=data().derive();expect(candidates.find(c=>c.dimension==='Availability')?.uncertainty).toContain('not independently verified');expect(candidates.find(c=>c.dimension==='Compromise')?.proposedStatus).toBe('Investigating');});
});
