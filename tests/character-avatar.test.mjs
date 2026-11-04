import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAvatar,replaceCharacterAvatar} from '../src/lib/characterAvatar.js';
import {resolveCharacterReference,confirmedIdentity} from '../src/lib/characterIdentity.js';
import {saveCharacterAvatar} from '../src/lib/saveCharacterAvatar.js';
const sig=new Uint8Array([137,80,78,71,13,10,26,10]);
const file=new File([sig],'a.png',{type:'image/png'});
const decode=async()=>({width:100,height:75,close(){}});
test('avatar rejects disguised, oversized and undecodable images before upload',async()=>{
 for(const input of [new File(['bad'],'a.png',{type:'image/png'}),{size:26*1024*1024,type:'image/png'}])await assert.rejects(validateAvatar(input,decode));
 await assert.rejects(validateAvatar(file,async()=>{throw Error('decode failed');}));
});
test('unmounted upload cannot request a ticket or persist a replacement',async()=>{
 const request=new AbortController();request.abort();let calls=0;
 await assert.rejects(saveCharacterAvatar({file,decode,signal:request.signal,upload:()=>{calls++;}}));assert.equal(calls,0);
});
test('legacy screenplay alias survives replacement while old visual attributes are marked stale',()=>{
 const old={id:'a',name:'Judge',imageUrl:'https://example.org/one',characterIdentity:{version:1,status:'confirmed',characterId:'a',projectId:'proj_a',confirmedId:'person_black_robe',referenceImage:{sha256:'a'.repeat(64)}}};
 const next=replaceCharacterAvatar([old],'a',old.imageUrl,'https://example.org/two');
 assert.equal(confirmedIdentity(next[0],'proj_a'),null);assert.equal(resolveCharacterReference('person_black_robe',next,'proj_a').id,'a');assert.equal(next[0].characterIdentity.confirmedId,'person_black_robe');
});
