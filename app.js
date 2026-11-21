'use strict';
const $=id=>document.getElementById(id);
const S={teacher:'',exam:null,students:[],stream:null,processing:false,lastPaper:'',lastDone:0};
function message(s,error=false){$('message').textContent=s;$('message').classList.toggle('error',error)}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function api(action,data={}){
  if(!/^https:\/\//.test(window.OMR_API_URL)||window.OMR_API_URL.includes('YOUR-WORKER'))throw Error('กรุณาแก้ config.js เป็น URL ของ Cloudflare Worker');
  const r=await fetch(window.OMR_API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,teacher:S.teacher,data})});
  const x=await r.json();if(!r.ok||!x.ok)throw Error(x.error||'API error');return x.data;
}
async function attempt(fn){try{await fn()}catch(e){console.error(e);message(e.message||String(e),true)}}
async function startForTeacher(){
  S.teacher=$('teacher').value.trim();if(!S.teacher)throw Error('กรุณาเลือกชื่อครู');
  await api('login');$('loginPanel').classList.add('hidden');$('workspace').classList.remove('hidden');
  $('welcome').textContent='ครู '+S.teacher;message('เลือกครูเรียบร้อย');await listExams();
}
$('login').onclick=()=>attempt(startForTeacher);
$('logout').onclick=()=>{stopCamera();S.teacher='';S.exam=null;$('workspace').classList.add('hidden');$('loginPanel').classList.remove('hidden');message('กลับหน้าเลือกครู')};
attempt(async()=>{
  const names=await api('teachers');$('teacher').innerHTML='<option value="">-- เลือกชื่อครู --</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
  message('โหลดรายชื่อครูเรียบร้อย');
});
$('loadRooms').onclick=()=>attempt(async()=>{const rooms=await api('listRooms',{academicYear:$('year').value});$('rooms').innerHTML=rooms.map(r=>`<label class="checkroom"><input type="checkbox" value="${esc(r)}"> ${esc(r)}</label>`).join('');message('โหลดห้องเรียน '+rooms.length+' ห้อง')});
function renderEssayQuestionInputs(){
 const mode=$('essay').value;
 const n=mode==='none'?0:Math.min(20,Math.max(0,Number($('essayCount').value)||0));
 const old=[...document.querySelectorAll('.essay-question')].map(x=>x.value);
 $('essayQuestionsBox').innerHTML=Array.from({length:n},(_,i)=>`<label class="essay-field">โจทย์อัตนัยข้อ ${i+1}<textarea class="essay-question" rows="2" maxlength="2000" placeholder="พิมพ์คำถามที่จะปรากฏบนกระดาษข้อสอบ">${esc(old[i]||'')}</textarea></label>`).join('');
 $('essayQuestionsBox').classList.toggle('hidden',!n);
}
$('essay').addEventListener('change',renderEssayQuestionInputs);
$('essayCount').addEventListener('input',renderEssayQuestionInputs);
renderEssayQuestionInputs();
$('create').onclick=()=>attempt(async()=>{
  const rooms=[...$('rooms').querySelectorAll('input:checked')].map(x=>x.value);
  const result=await api('createExam',{academicYear:$('year').value,semester:$('semester').value,examType:$('examType').value,subjectCode:$('code').value.trim(),subjectName:$('subject').value.trim(),rooms,numQuestions:Number($('nq').value),choiceSet:$('choices').value,essayMode:$('essay').value,essayCount:Number($('essayCount').value),essayLines:Number($('essayLines').value),essayQuestions:[...document.querySelectorAll('.essay-question')].map(x=>x.value.trim())});
  message('สร้างชุดข้อสอบสำเร็จ');await listExams();await openExam(result.examId);
});
async function listExams(){
 const data=await api('listExams');$('examList').innerHTML='<table><tr><th>ประเภท/วิชา</th><th>ปี/ภาค</th><th>ห้อง</th><th>เฉลย</th><th></th></tr>'+data.map(e=>`<tr><td>${esc(e.examType)}<br>${esc(e.subjectName)} (${esc(e.subjectCode)})</td><td>${esc(e.academicYear)}/${esc(e.semester)}</td><td>${esc(e.rooms.join(', '))}</td><td>${e.hasKey?'ครบ':'รอเฉลย'}</td><td><button data-exam="${esc(e.examId)}">เปิด</button></td></tr>`).join('')+'</table>';
 $('examList').querySelectorAll('[data-exam]').forEach(b=>b.onclick=()=>attempt(()=>openExam(b.dataset.exam)));
}
$('reload').onclick=()=>attempt(listExams);
async function openExam(id){
 stopCamera();S.exam=await api('getExam',{examId:id});S.students=await api('getStudents',{examId:id});
 const e=S.exam;$('currentPanel').classList.remove('hidden');$('examTitle').textContent=`${e.examType} • ${e.subjectName}`;
 $('examMeta').textContent=`${e.subjectCode} | ${e.academicYear}/${e.semester} | ${e.rooms.join(', ')} | ${e.numQuestions} ข้อ (${e.totalPages} แผ่น/คน) | นักเรียน ${S.students.length} คน | สแกนแล้ว ${e.scanned} คน`;
 const ch=[...e.choiceSet];$('keyInputs').innerHTML=Array.from({length:e.numQuestions},(_,i)=>`<label>ข้อ ${i+1}<select id="key${i}"><option value="">—</option>${ch.map(c=>`<option value="${esc(c)}" ${e.answerKey[i]===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label>`).join('');
 $('manualStudent').innerHTML='<option value="">อ่านจาก QR อัตโนมัติ</option>'+S.students.map(s=>`<option value="${esc(s.studentId)}">${esc(s.room)} ${esc(s.studentId)} ${esc(s.name)}</option>`).join('');
 $('manualPage').innerHTML=Array.from({length:e.totalPages},(_,i)=>`<option value="${i+1}">แผ่น ${i+1}/${e.totalPages}</option>`).join('');$('scanResult').innerHTML='';$('report').innerHTML='';$('reportRoom').innerHTML='<option value="">รวมทุกห้อง</option>'+e.rooms.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join('');message('เปิดชุดข้อสอบแล้ว');$('currentPanel').scrollIntoView({behavior:'smooth'});
}
$('saveKey').onclick=()=>attempt(async()=>{
  const key=Array.from({length:S.exam.numQuestions},(_,i)=>$('key'+i).value);
  if(key.some(x=>!x))throw Error('กรุณากรอกเฉลยให้ครบก่อนบันทึก');
  let confirmRegrade=false;
  if(S.exam.scanned && JSON.stringify(key)!==JSON.stringify(S.exam.answerKey)){
    if(!confirm('มีผลตรวจอยู่แล้ว การเปลี่ยนเฉลยจะคำนวณคะแนนใหม่ทั้งหมด ต้องการดำเนินการหรือไม่?'))return;
    confirmRegrade=true;
  }
  const r=await api('saveKey',{examId:S.exam.examId,answerKey:key,confirmRegrade});
  S.exam.answerKey=key;S.exam.status='READY';message('บันทึกเฉลยเรียบร้อย '+(r.regraded?`คำนวณใหม่ ${r.regraded} คน`:''));await listExams();
});
$('printNamed').onclick=()=>attempt(()=>OMRPrint.print(S.exam,S.students));
$('printBlank').onclick=()=>attempt(()=>{let n=Math.floor(Number($('blankCount').value));if(n<1||n>100)throw Error('จำนวน 1-100');OMRPrint.print(S.exam,Array.from({length:n},()=>null))});
$('scanStart').onclick=()=>attempt(startCamera);
$('scanStop').onclick=stopCamera;
$('snap').onclick=()=>attempt(scanFrame);
$('reportButton').onclick=()=>attempt(showReport);
$('reportRoom').onchange=()=>attempt(showReport);
$('finalize').onclick=()=>attempt(async()=>{
 if(!confirm('บันทึกผลวิเคราะห์รวมทุกห้อง ณ ขณะนี้ลงรายงานย้อนหลัง V3 ใช่หรือไม่?'))return;
 const r=await api('finalize',{examId:S.exam.examId});
 message('บันทึกรายงาน V3 แล้ว รหัส '+r.analysisId+(r.alreadySaved?' (เคยบันทึกแล้ว)':''));
 await openExam(S.exam.examId);
});
async function showReport(){
  const r=await api('report',{examId:S.exam.examId,room:$('reportRoom').value});if(!$('reportRoom').value)S.exam.scanned=r.scanned;
  const rows=r.students.map((s,i)=>`<tr><td>${i+1}</td><td>${esc(s.studentId)}</td><td>${esc(s.name)}</td><td>${esc(s.room)}</td><td>${s.score===null?'—':s.score+' / '+S.exam.numQuestions}</td><td>${s.status==='OK'?'ครบแล้ว':s.status==='PARTIAL'?'ยังไม่ครบ (แผ่น '+s.pagesDone.join(', ')+')':'รอตรวจ'}</td></tr>`).join('');
  const analysis=r.analysis;
  let a='';if(analysis){a=`<h3>ผลวิเคราะห์ปรนัย (${r.scanned} คนที่ตรวจแล้ว)</h3><p>เฉลี่ย ${esc(analysis.scoreSummary.mean)} | S.D. ${esc(analysis.scoreSummary.sd)} | KR-20 ${esc(analysis.kr20)} | ข้อที่ใช้ได้ดี ${analysis.qualitySummary.goodItems}</p><div class="scroll"><table><tr><th>ข้อ</th><th>เฉลย</th><th>p</th><th>r</th><th>ผล</th></tr>${analysis.analysis.map(v=>`<tr><td>${v.item}</td><td>${esc(v.correctChoice)}</td><td>${v.p}</td><td>${v.r}</td><td>${esc(v.interpretation)}</td></tr>`).join('')}</table></div>`;}
  $('report').innerHTML=`<h3>รายงานคะแนน ตรวจครบ ${r.scanned}/${r.total} คน • ค้างบางแผ่น ${r.partial} คน</h3><div class="row"><button id="csvDownload">ดาวน์โหลด CSV</button><button id="reportPrint" class="secondary">พิมพ์รายงาน / PDF</button></div><table><tr><th>ที่</th><th>รหัส</th><th>ชื่อ</th><th>ชั้น</th><th>คะแนน</th><th>สถานะ</th></tr>${rows}</table>${a}`;
  $('csvDownload').onclick=()=>{const records=[['เลขประจำตัว','ชื่อ-นามสกุล','ชั้น','คะแนน','เต็ม','แผ่นที่ตรวจแล้ว','สถานะ'],...r.students.map(s=>[s.studentId,s.name,s.room,s.score??'',S.exam.numQuestions,s.pagesDone.join('/'),s.status==='OK'?'ตรวจครบ':s.status==='PARTIAL'?'ยังไม่ครบ':'รอตรวจ'])];const csv='\ufeff'+records.map(x=>x.map(y=>'"'+String(y).replace(/"/g,'""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='scores-'+S.exam.subjectCode+'.csv';a.click();URL.revokeObjectURL(url)};
  $('reportPrint').onclick=()=>{const w=window.open('','_blank');if(!w)throw Error('กรุณาอนุญาต Popup');w.document.write('<html><head><meta charset="utf-8"><title>รายงานคะแนน</title><style>body{font-family:Arial,sans-serif}table{border-collapse:collapse;width:100%}td,th{border:1px solid #aaa;padding:5px;font-size:11px}</style></head><body><h2>รายงานคะแนน '+esc(S.exam.subjectName)+'</h2>'+$('report').innerHTML.replace(/<button[^>]*>.*?<\/button>/gs,'')+'</body></html>');w.document.close();w.focus();w.print()};
  message(`แสดงรายงาน ${r.scanned}/${r.total} คน`);
}
