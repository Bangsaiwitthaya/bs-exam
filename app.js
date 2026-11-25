'use strict';
const $=id=>document.getElementById(id);
const S={teacher:'',exam:null,students:[],stream:null,processing:false,lastPaper:'',lastDone:0,editExamId:null};
function message(s,error=false){$('message').textContent=s;$('message').classList.toggle('error',error)}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function api(action,data={}){
  if(!/^https:\/\//.test(window.OMR_API_URL)||window.OMR_API_URL.includes('YOUR-WORKER'))throw Error('กรุณาแก้ config.js เป็น URL ของ Cloudflare Worker');
  const r=await fetch(window.OMR_API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,teacher:S.teacher,data})});
  const x=await r.json();if(!r.ok||!x.ok)throw Error(x.error||'API error');return x.data;
}
async function attempt(fn){try{await fn()}catch(e){console.error(e);message(e.message||String(e),true);await ExamUI.alert('ดำเนินการไม่สำเร็จ',e.message||String(e),'error')}}
async function startForTeacher(){
 const selected=$('teacher').value.trim();if(!selected)throw Error('กรุณาเลือกชื่อครู');
 ExamUI.busy('กำลังเปิดข้อมูลของครู...');
 try {
  S.teacher=selected;await api('login');await listExams();
 } catch(e){S.teacher='';throw e;} finally{ExamUI.close();}
 $('loginPanel').classList.add('hidden');$('workspace').classList.remove('hidden');
 $('welcome').textContent='ครู '+S.teacher;message('เลือกครูเรียบร้อย');ExamRoute.afterLogin();
 await ExamUI.alert('เข้าสู่ระบบสำเร็จ','คุณกำลังใช้งานในชื่อ '+S.teacher,'success');
}
$('login').onclick=()=>attempt(startForTeacher);
$('logout').onclick=()=>attempt(async()=>{if(!await ExamUI.confirm('เปลี่ยนชื่อครู','กลับไปเลือกชื่อครูใหม่ใช่หรือไม่?','เปลี่ยนชื่อครู'))return;stopCamera();S.teacher='';S.exam=null;$('workspace').classList.add('hidden');$('loginPanel').classList.remove('hidden');ExamRoute.navigate('create');message('กลับหน้าเลือกครู');await ExamUI.alert('เปลี่ยนชื่อครูเรียบร้อย','กรุณาเลือกชื่อครูที่ต้องการใช้งาน','success')});
attempt(async()=>{
  const names=await api('teachers');$('teacher').innerHTML='<option value="">-- เลือกชื่อครู --</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
  message('โหลดรายชื่อครูเรียบร้อย');
});
$('loadRooms').onclick=()=>attempt(async()=>{const rooms=await api('listRooms',{academicYear:$('year').value});$('rooms').innerHTML=rooms.map(r=>`<label class="checkroom"><input type="checkbox" value="${esc(r)}"> ${esc(r)}</label>`).join('');message('โหลดห้องเรียน '+rooms.length+' ห้อง');ExamUI.toast('พบห้องเรียน '+rooms.length+' ห้อง')});
function renderEssayQuestionInputs(){
 const mode=$('essay').value;
 const n=mode==='none'?0:Math.min(20,Math.max(0,Number($('essayCount').value)||0));
 const old=[...document.querySelectorAll('.essay-question')].map(x=>x.value);
 $('essayQuestionsBox').innerHTML=Array.from({length:n},(_,i)=>`<label class="essay-field">โจทย์อัตนัยข้อ ${i+1}<textarea class="essay-question" rows="2" maxlength="2000" placeholder="พิมพ์คำถามที่จะปรากฏบนกระดาษข้อสอบ">${esc(old[i]||'')}</textarea><span>ภาพประกอบโจทย์ (ถ้ามี) <input class="essay-upload" type="file" accept="image/png,image/jpeg"></span></label>`).join('');
 $('essayQuestionsBox').classList.toggle('hidden',!n);
}
$('essay').addEventListener('change',renderEssayQuestionInputs);
$('essayCount').addEventListener('input',renderEssayQuestionInputs);
renderEssayQuestionInputs();
function readExamForm(){
 return {academicYear:$('year').value,semester:$('semester').value,examType:$('examType').value,
  subjectCode:$('code').value.trim(),subjectName:$('subject').value.trim(),
  rooms:[...$('rooms').querySelectorAll('input:checked')].map(x=>x.value),numQuestions:Number($('nq').value),
  choiceSet:$('choices').value,essayMode:$('essay').value,
  essayCount:$('essay').value==='none'?0:Number($('essayCount').value),essayLines:Number($('essayLines').value),
  essayQuestions:$('essay').value==='none'?[]:[...document.querySelectorAll('.essay-question')].map(x=>x.value.trim())};
}
function cancelEdit(){S.editExamId=null;$('createTitle').textContent='สร้างกระดาษคำตอบ';$('create').textContent='บันทึกชุดข้อสอบ';$('cancelEdit').classList.add('hidden');}
$('cancelEdit').onclick=cancelEdit;
$('create').onclick=()=>attempt(async()=>{
 const button=$('create');
 if(button.disabled)return;
 const form=readExamForm(),editing=!!S.editExamId;
 if(!form.rooms.length)throw Error('กรุณาเลือกอย่างน้อย 1 ห้องเรียน');
 if(!await ExamUI.confirm(editing?'ยืนยันแก้ไขชุดข้อสอบ':'ยืนยันสร้างชุดข้อสอบ',
  `${form.subjectName} จำนวน ${form.numQuestions} ข้อ สำหรับ ${form.rooms.length} ห้องเรียน${editing?'\n(หากเปลี่ยนจำนวนข้อหรือรูปแบบตัวเลือก เฉลยเดิมจะถูกล้าง)':''}`,
  editing?'บันทึกการแก้ไข':'สร้างชุดข้อสอบ'))return;
 button.disabled=true;
 try {
 const photos=[...document.querySelectorAll('.essay-upload')].map(x=>x.files[0]||null);
 ExamUI.busy(editing?'กำลังแก้ไขชุดข้อสอบ...':'กำลังสร้างชุดข้อสอบ...');
 let result;
 try{result=await api(editing?'updateExam':'createExam',{...form,...(editing?{examId:S.editExamId}:{})});}
 finally{ExamUI.close()}
 for(let i=0;i<photos.length;i++)if(photos[i]){
  ExamUI.busy('กำลังบันทึกภาพประกอบข้อ '+(i+1));
  try{const data=await compressEssayPhoto(photos[i]);await api('uploadEssayImage',{examId:result.examId,index:i,base64:data});}finally{ExamUI.close()}
 }
 cancelEdit();message(editing?'แก้ไขชุดข้อสอบสำเร็จ':'สร้างชุดข้อสอบสำเร็จ');
 await ExamUI.alert('บันทึกสำเร็จ',editing?'แก้ไขข้อมูลชุดข้อสอบเรียบร้อยแล้ว':'สร้างชุดข้อสอบเรียบร้อยแล้ว','success');
 await listExams();await openExam(result.examId,{silent:true});ExamRoute.navigate('print');
 }finally{button.disabled=false;}
});
async function editExam(id){
 const e=await api('getExam',{examId:id});
 if(e.scanned||e.lastAnalysisId)throw Error('ชุดข้อสอบมีผลตรวจหรือรายงานย้อนหลังแล้ว ไม่สามารถแก้ไขได้');
 S.editExamId=id;
 $('year').value=e.academicYear;$('semester').value=e.semester;$('examType').value=e.examType;
 $('code').value=e.subjectCode;$('subject').value=e.subjectName;$('nq').value=e.numQuestions;
 $('choices').value=e.choiceSet;$('essay').value=e.essayMode;$('essayCount').value=e.essayCount;
 $('essayLines').value=e.essayLines;renderEssayQuestionInputs();
 [...document.querySelectorAll('.essay-question')].forEach((x,i)=>x.value=e.essayQuestions[i]||'');
 const roomList=await api('listRooms',{academicYear:e.academicYear});
 $('rooms').innerHTML=roomList.map(r=>`<label class="checkroom"><input type="checkbox" value="${esc(r)}" ${e.rooms.includes(r)?'checked':''}> ${esc(r)}</label>`).join('');
 $('createTitle').textContent='แก้ไขชุดกระดาษคำตอบ';$('create').textContent='บันทึกการแก้ไข';$('cancelEdit').classList.remove('hidden');
 ExamRoute.navigate('create');
 await ExamUI.alert('เปิดชุดข้อสอบสำหรับแก้ไข','แก้ไขข้อมูลแล้วกดบันทึกได้ ภาพอัตนัยเดิมจะคงอยู่ถ้าไม่ได้อัปโหลดภาพใหม่','info');
}
async function deleteExam(id){
 const e=await api('getExam',{examId:id});
 if(e.scanned||e.lastAnalysisId)throw Error('ชุดนี้มีผลตรวจหรือรายงานย้อนหลังแล้ว ไม่สามารถลบได้');
 if(!await ExamUI.confirm('ยืนยันลบชุดกระดาษคำตอบ',
  `ต้องการลบ ${e.subjectName} (${e.subjectCode}) ${e.examType} ใช่หรือไม่?\nระบบจะซ่อนชุดข้อสอบออกจากรายการ และกระดาษที่พิมพ์ไว้จะใช้กับระบบนี้ไม่ได้`,
  'ลบชุดข้อสอบ'))return;
 ExamUI.busy('กำลังลบชุดข้อสอบ...');
 try{await api('deleteExam',{examId:id,confirm:true});}finally{ExamUI.close()}
 if(S.exam?.examId===id){stopCamera();S.exam=null;S.students=[];$('currentPanel').classList.add('hidden');}
 if(S.editExamId===id)cancelEdit();
 await listExams();await ExamUI.alert('ลบสำเร็จ','ซ่อนชุดกระดาษคำตอบออกจากรายการแล้ว','success');
}
async function listExams(){
 const data=await api('listExams');
 $('examList').innerHTML='<table><tr><th>ประเภท/วิชา</th><th>ปี/ภาค</th><th>ห้อง</th><th>เฉลย</th><th>จัดการ</th></tr>'+
 data.map(e=>`<tr><td>${esc(e.examType)}<br>${esc(e.subjectName)} (${esc(e.subjectCode)})</td><td>${esc(e.academicYear)}/${esc(e.semester)}</td><td>${esc(e.rooms.join(', '))}</td><td>${e.hasKey?'ครบ':'รอเฉลย'}</td><td><div class="exam-actions"><button data-exam="${esc(e.examId)}">เปิด</button><button class="secondary" data-edit="${esc(e.examId)}">แก้ไข</button><button class="danger-action" data-delete="${esc(e.examId)}">ลบ</button></div></td></tr>`).join('')+'</table>';
 $('examList').querySelectorAll('[data-exam]').forEach(b=>b.onclick=()=>attempt(()=>openExam(b.dataset.exam)));
 $('examList').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>attempt(()=>editExam(b.dataset.edit)));
 $('examList').querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>attempt(()=>deleteExam(b.dataset.delete)));
 if($('createExamList')){
  $('createExamList').innerHTML=data.length?'<table><tr><th>วิชา</th><th>ปี/ภาค</th><th>จัดการ</th></tr>'+data.map(e=>
   `<tr><td>${esc(e.subjectName)} (${esc(e.subjectCode)})</td><td>${esc(e.academicYear)}/${esc(e.semester)}</td><td><div class="exam-actions"><button class="secondary" data-create-edit="${esc(e.examId)}">แก้ไข</button><button class="danger-action" data-create-delete="${esc(e.examId)}">ลบ</button></div></td></tr>`).join('')+'</table>':'<p class="sub">ยังไม่มีชุดข้อสอบ</p>';
  $('createExamList').querySelectorAll('[data-create-edit]').forEach(b=>b.onclick=()=>attempt(()=>editExam(b.dataset.createEdit)));
  $('createExamList').querySelectorAll('[data-create-delete]').forEach(b=>b.onclick=()=>attempt(()=>deleteExam(b.dataset.createDelete)));
 }
}
$('reload').onclick=()=>attempt(listExams);$('reloadCreate').onclick=()=>attempt(listExams);
async function openExam(id,{silent=false}={}){
 stopCamera();ExamUI.busy('กำลังเปิดชุดข้อสอบ...');
 try{S.exam=await api('getExam',{examId:id});S.students=await api('getStudents',{examId:id});}finally{ExamUI.close()}
 const e=S.exam;$('currentPanel').classList.remove('hidden');$('examTitle').textContent=`${e.examType} • ${e.subjectName}`;
 $('examMeta').textContent=`${e.subjectCode} | ${e.academicYear}/${e.semester} | ${e.rooms.join(', ')} | ${e.numQuestions} ข้อ (กระดาษ OMR 1 แผ่น/คน) | นักเรียน ${S.students.length} คน | สแกนแล้ว ${e.scanned} คน`;
 const ch=[...e.choiceSet];$('keyInputs').innerHTML=Array.from({length:e.numQuestions},(_,i)=>`<label>ข้อ ${i+1}<select id="key${i}"><option value="">—</option>${ch.map(c=>`<option value="${esc(c)}" ${e.answerKey[i]===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label>`).join('');
 $('manualStudent').innerHTML='<option value="">อ่านจาก QR อัตโนมัติ</option>'+S.students.map(s=>`<option value="${esc(s.studentId)}">${esc(s.room)} ${esc(s.studentId)} ${esc(s.name)}</option>`).join('');
 $('manualPage').innerHTML=Array.from({length:e.totalPages},(_,i)=>`<option value="${i+1}">แผ่น ${i+1}/${e.totalPages}</option>`).join('');$('scanResult').innerHTML='';$('report').innerHTML='';$('reportRoom').innerHTML='<option value="">รวมทุกห้อง</option>'+e.rooms.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join('');message('เปิดชุดข้อสอบแล้ว');ExamRoute.afterSelect();
 if(!silent)await ExamUI.alert('เปิดชุดข้อสอบสำเร็จ',`${e.subjectName} • ${e.numQuestions} ข้อ • ${S.students.length} คน`,'success');
}
$('saveKey').onclick=()=>attempt(async()=>{
  const key=Array.from({length:S.exam.numQuestions},(_,i)=>$('key'+i).value);
  if(key.some(x=>!x))throw Error('กรุณากรอกเฉลยให้ครบก่อนบันทึก');
  let confirmRegrade=false;
  if(S.exam.scanned && JSON.stringify(key)!==JSON.stringify(S.exam.answerKey)){
    if(!await ExamUI.confirm('มีผลตรวจแล้ว','การเปลี่ยนเฉลยจะคำนวณคะแนนใหม่ทั้งหมด ต้องการดำเนินการหรือไม่?','คำนวณคะแนนใหม่'))return;
    confirmRegrade=true;
  }
  if(!confirmRegrade && !await ExamUI.confirm('บันทึกเฉลย',`ยืนยันเฉลย ${key.length} ข้อ ก่อนเริ่มสแกนตรวจ?`,'บันทึกเฉลย'))return;
  ExamUI.busy('กำลังบันทึกเฉลย...');let r;try{r=await api('saveKey',{examId:S.exam.examId,answerKey:key,confirmRegrade})}finally{ExamUI.close()}
  S.exam.answerKey=key;S.exam.status='READY';$('keyStatus').textContent='มีเฉลยครบ';$('keySection').classList.add('hidden');message('บันทึกเฉลยเรียบร้อย '+(r.regraded?`คำนวณใหม่ ${r.regraded} คน`:''));ExamUI.toast('บันทึกเฉลยสำเร็จ'+(r.regraded?' และคำนวณคะแนนย้อนหลังแล้ว':''));await listExams();
});
$('printNamed').onclick=()=>attempt(()=>{if(!S.students.length)throw Error('ไม่พบรายชื่อนักเรียน');OMRPrint.print(S.exam,S.students);ExamUI.alert('เปิดหน้าพิมพ์แล้ว','กระดาษรายบุคคล '+S.students.length+' แผ่น กรุณาพิมพ์ขนาด 100%','success')});
$('printBlank').onclick=()=>attempt(()=>{let n=Math.floor(Number($('blankCount').value));if(n<1||n>100)throw Error('จำนวน 1–100 แผ่น');OMRPrint.print(S.exam,Array.from({length:n},()=>null));ExamUI.alert('เปิดหน้าพิมพ์แล้ว','กระดาษเปล่า '+n+' แผ่น กรุณาพิมพ์ขนาด 100%','success')});
$('scanAutoStart').onclick=()=>attempt(async()=>{if(!await ExamUI.confirm('เปิดกล้อง QR อัตโนมัติ','สแกนกระดาษต่างวิชาสลับกันได้ และถ้ายังไม่มีเฉลยจะเก็บคำตอบไว้ก่อน','เปิดกล้อง'))return;await startCamera(true)});
$('scanStart').onclick=()=>attempt(async()=>{if(!await ExamUI.confirm('เริ่มตรวจด้วยกล้อง','ระบบจะอ่าน QR/รหัสนักเรียนและช่องคำตอบในครั้งเดียว กรุณาตรวจเฉลยให้ถูกต้องก่อนเริ่ม','เปิดกล้อง'))return;await startCamera()});
$('scanStop').onclick=()=>{stopCamera();ExamUI.toast('ปิดกล้องแล้ว','info')};
$('snap').onclick=()=>attempt(scanFrame);
$('reportButton').onclick=()=>attempt(async()=>{
 if(!S.exam)throw Error('กรุณาเลือกชุดข้อสอบก่อน');
 const button=$('reportButton');button.disabled=true;ExamUI.busy('กำลังโหลดคะแนนและคำนวณผลวิเคราะห์...');
 try{const result=await showReport();ExamUI.close();await ExamUI.alert('โหลดรายงานเรียบร้อย',`พบผลตรวจ ${result.scanned}/${result.total} คน${result.analysis?' • พร้อมดูผลวิเคราะห์แบบ V3':' • ยังไม่สามารถวิเคราะห์ได้ (ตรวจสอบสถานะรอเฉลย)'}`,result.analysis?'success':'warning');}
 finally{ExamUI.close();button.disabled=false;}
});
$('repairPartials').onclick=()=>attempt(async()=>{
 if(!S.exam)throw Error('กรุณาเลือกชุดข้อสอบก่อน');
 if(!await ExamUI.confirm('ตรวจสอบข้อมูลที่ค้าง PARTIAL','ระบบจะตรวจเฉพาะผลเก่าที่มีคำตอบครบทั้งแผ่นและไม่ว่างทั้งหมด รายการที่ข้อมูลไม่ครบจะไม่แตะต้อง และต้องสแกนใหม่','ตรวจสอบและซ่อม'))return;
 ExamUI.busy('กำลังตรวจสอบข้อมูลค้าง...');let res;try{res=await api('repairPartials',{examId:S.exam.examId,confirm:true})}finally{ExamUI.close()}
 const review=res.review.map(x=>x.studentId).join(', ');
 await ExamUI.alert('ตรวจสอบข้อมูลค้างเรียบร้อย',`ซ่อมสำเร็จ ${res.repaired.length} คน • ต้องสแกนใหม่ ${res.review.length} คน${review?'\nรหัส: '+review:''}`,res.review.length?'warning':'success');
 await showReport();
});
$('reportRoom').onchange=()=>attempt(async()=>{ExamUI.busy('กำลังเปลี่ยนห้องและคำนวณผล...');try{await showReport();}finally{ExamUI.close();}});
$('finalize').onclick=()=>attempt(async()=>{
 if(!await ExamUI.confirm('เก็บผลวิเคราะห์ย้อนหลัง','บันทึกผลวิเคราะห์รวมทุกห้อง ณ ขณะนี้เป็นรายงานย้อนหลัง?','บันทึกรายงาน'))return;
 ExamUI.busy('กำลังเก็บรายงานย้อนหลัง...');let r;try{r=await api('finalize',{examId:S.exam.examId})}finally{ExamUI.close()}
 await ExamUI.alert(r.alreadySaved?'มีรายงานนี้อยู่แล้ว':'เก็บผลวิเคราะห์สำเร็จ','รหัสรายงาน: '+r.analysisId+(r.alreadySaved?' (เคยบันทึกแล้ว)':''),'success');message('เก็บรายงานย้อนหลังแล้ว รหัส '+r.analysisId+(r.alreadySaved?' (เคยบันทึกแล้ว)':''));
 await openExam(S.exam.examId);
});
// V4.12 — use the same analyzeTestData result model as V3, without archiving until teacher requests it.
function omrV3AnalysisHTML(an,exam,scanned){
 if(!an)return `<div class="omr-analysis-empty"><h3>ยังไม่มีผลวิเคราะห์</h3><p>พบผลตรวจที่สมบูรณ์ 0 คน กรุณาตรวจว่าชีท OMR_Responses มีสถานะ OK และอัปเดต Apps Script V4.11 แล้ว</p></div>`;
 const q=an.qualitySummary||{}, ss=an.scoreSummary||{};
 const choices=Array.from(new Set((an.analysis||[]).flatMap(it=>[...Object.keys(it.choices||{}),...Object.keys(it.choiceDetail||{}),it.correctChoice].filter(Boolean))));
 const preferred=[...String(exam.choiceSet||'กขคง')];choices.sort((a,b)=>{const i=preferred.indexOf(a),j=preferred.indexOf(b);return (i<0?99:i)-(j<0?99:j)||String(a).localeCompare(String(b),'th')});
 const val=x=>x===undefined||x===null||x===''?'—':esc(x);
 const labels=[['KR-20',`${val(an.kr20)}${q.kr20Level?' ('+val(q.kr20Level)+')':''}`],['ข้อใช้ได้ดี',val(q.goodItems)],['ควรปรับปรุง',val(q.improveItems)],['ใช้งานไม่ได้',val(q.badItems)],['คะแนนเฉลี่ย',`${val(ss.mean)} / ${val(ss.fullScore||exam.numQuestions)}`]];
 const cards=labels.map(([label,value],i)=>`<div class="omr-v3-card c${i}"><strong>${value}</strong><span>${label}</span></div>`).join('');
 const rows=(an.analysis||[]).map(it=>{
  const cls=it.interpretation==='ใช้ได้ดี'?'omr-v3-good':it.interpretation==='ควรปรับปรุง'?'omr-v3-warn':'omr-v3-bad';
  const cells=choices.map(c=>{const d=(it.choiceDetail||{})[c]||{},label=(it.choiceAnalysis||{})[c]||'',corr=c===it.correctChoice;
    return `<td><b class="${corr?'omr-v3-correct':''}">${val(d.count??(it.choices||{})[c]??0)} คน (${val(d.percent??0)}%)</b><small>สูง ${val(d.high)} / ต่ำ ${val(d.low)}</small><small>${val(label)}</small></td>`;
  }).join('');
  return `<tr class="${cls}"><td><b>${val(it.item)}</b></td><td><b>${val(it.correctChoice)}</b></td>${cells}<td>${val(it.p)}<small>${val(it.difficultyLevel)}</small></td><td>${val(it.r)}<small>${val(it.discriminationLevel)}</small></td><td><b>${val(it.interpretation)}</b><small>${val(it.reason)}</small></td></tr>`;
 }).join('');
 const counts=new Map();(ss.individualScores||[]).forEach(n=>counts.set(Number(n),(counts.get(Number(n))||0)+1));
 const maximum=Math.max(1,...counts.values());const scoreMax=Number(ss.fullScore||exam.numQuestions)||20;
 const bars=Array.from({length:scoreMax+1},(_,i)=>`<div class="omr-histo-col"><div class="omr-histo-bar" style="height:${Math.max(1,Math.round((counts.get(i)||0)/maximum*100))}%" title="${i} คะแนน: ${counts.get(i)||0} คน"></div><small>${i}</small></div>`).join('');
 return `<section class="omr-v3-report" id="omrV3Analysis">
 <div class="omr-v3-header"><h3>ผลการวิเคราะห์ข้อสอบ</h3><p>วิชา ${val(exam.subjectName)} (${val(exam.subjectCode)}) • ${val(exam.semester)}/${val(exam.academicYear)} • วิเคราะห์จากผู้ตรวจสำเร็จ ${scanned} คน</p></div>
 <div class="omr-v3-summary">${cards}</div>
 <p class="omr-v3-hint"><b>ความเชื่อมั่น:</b> ${val(q.kr20Text)} &nbsp;|&nbsp; กลุ่มสูงและต่ำประมาณ ${val(q.groupPercentage??27)}% กลุ่มละ ${val(q.groupSize)} คน</p>
 <div class="omr-v3-table-wrap"><table class="omr-v3-table"><thead><tr><th>ข้อ</th><th>เฉลย</th>${choices.map(c=>`<th>${esc(c)}</th>`).join('')}<th>P</th><th>R</th><th>สรุป</th></tr></thead><tbody>${rows}</tbody></table></div>
 <div class="omr-v3-bottom"><table class="omr-v3-stats"><thead><tr><th colspan="2">สถิติคะแนน</th></tr></thead><tbody><tr><td>คะแนนเต็ม</td><td>${val(ss.fullScore||exam.numQuestions)}</td></tr><tr><td>ค่าเฉลี่ย</td><td>${val(ss.mean)}</td></tr><tr><td>S.D.</td><td>${val(ss.sd)}</td></tr><tr><td>สูงสุด</td><td>${val(ss.maxScore)}</td></tr><tr><td>ต่ำสุด</td><td>${val(ss.minScore)}</td></tr></tbody></table><div class="omr-histo"><b>การแจกแจงคะแนน</b><div class="omr-histo-chart">${bars}</div></div></div>
 </section>`;
}
function omrPrintFullReport(r){
 const w=window.open('','_blank');if(!w)throw Error('กรุณาอนุญาต Pop-up ของเว็บไซต์ก่อน');
 const school=esc(S.exam.subjectName),total=S.exam.numQuestions;
 const scoreRows=r.students.map(st=>`<tr><td>${esc(st.studentId)}</td><td>${esc(st.name)}</td><td>${esc(st.room)}</td><td>${st.score===null?'—':st.score}</td><td>${total}</td><td>${st.score===null?'—':(st.score/total*100).toFixed(2)}</td></tr>`).join('');
 const summary=`<h2>โรงเรียนบางไทรวิทยา</h2><p class="center">${esc(S.exam.examType)} • ${school} (${esc(S.exam.subjectCode)}) • ${esc(S.exam.semester)}/${esc(S.exam.academicYear)} • ${esc($('reportRoom').value||'รวมทุกห้อง')}</p><p class="center">ตรวจแล้ว ${r.scanned} / ${r.total} คน</p>`;
 const analysisHTML=omrV3AnalysisHTML(r.analysis,S.exam,r.scanned);
 const scoreHTML=`<div class="scores-print"><h3>คะแนนรายบุคคล</h3><table><thead><tr><th>รหัสนักเรียน</th><th>ชื่อ–นามสกุล</th><th>ชั้น</th><th>คะแนน</th><th>เต็ม</th><th>ร้อยละ</th></tr></thead><tbody>${scoreRows}</tbody></table></div>`;
 const stylesheet=Array.from(document.styleSheets).find(x=>x.href?.includes('style.css'));
 const css=String.raw`@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
 @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Sarabun, sans-serif;color:#172b4d;font-size:9pt;margin:0}h2,.center{text-align:center;margin:4px 0}h3{margin:6px 0}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:4px;font-size:8pt;vertical-align:top}th{background:#f1f5f9}tr{break-inside:avoid}.omr-v3-header h3{font-size:14pt}.omr-v3-summary{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin:9px 0}.omr-v3-card{border:1px solid #dce2e9;padding:7px;text-align:center}.omr-v3-card strong{display:block;font-size:14pt}.omr-v3-card span{font-size:8pt}.omr-v3-hint{font-size:8pt;background:#eef4ff;padding:6px}.omr-v3-table-wrap{overflow:visible}.omr-v3-table{table-layout:fixed}.omr-v3-table th,.omr-v3-table td{font-size:7pt;text-align:center;padding:3px 2px;overflow-wrap:anywhere}.omr-v3-table small{display:block;font-size:6pt;line-height:1.35}.omr-v3-correct{color:#166534}.omr-v3-good{background:#f0fdf4}.omr-v3-warn{background:#fffbeb}.omr-v3-bad{background:#fef2f2}.omr-v3-bottom{display:flex;gap:20px;margin-top:12px;align-items:flex-start}.omr-v3-stats{width:240px}.omr-histo{flex:1}.omr-histo-chart{display:flex;align-items:flex-end;gap:2px;height:120px;border-bottom:1px solid #94a3b8}.omr-histo-col{height:100%;flex:1;display:flex;align-items:center;justify-content:flex-end;flex-direction:column;min-width:4px}.omr-histo-bar{width:85%;background:#7da4ec;min-height:1px}.omr-histo-col small{font-size:6pt}.scores-print{break-before:page}.scores-print td{font-size:8pt}`;
 w.document.open();w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>วิเคราะห์ข้อสอบ ${school}</title><style>${css}</style></head><body>${summary}${analysisHTML}${scoreHTML}</body></html>`);w.document.close();
 Promise.resolve(w.document.fonts?.ready).then(()=>{w.focus();w.print()});
}
async function showReport(){
 if(!S.exam)throw Error('กรุณาเลือกชุดข้อสอบก่อน');
 const r=await api('report',{examId:S.exam.examId,room:$('reportRoom').value});if(!$('reportRoom').value)S.exam.scanned=r.scanned;
 const rows=r.students.map((s,i)=>`<tr><td>${i+1}</td><td>${esc(s.studentId)}</td><td>${esc(s.name)}</td><td>${esc(s.room)}</td><td>${s.score===null?'—':s.score+' / '+S.exam.numQuestions}</td><td>${s.status==='OK'?'ตรวจคะแนนแล้ว':s.status==='WAIT_KEY'?'สแกนแล้ว • รอเฉลย':s.status==='PARTIAL'?'ยังไม่ครบ (แผ่น '+s.pagesDone.join(', ')+')':'รอตรวจ'}</td></tr>`).join('');
 const analysisHTML=omrV3AnalysisHTML(r.analysis,S.exam,r.scanned);
 $('report').innerHTML=`<h3>รายงานคะแนน ${esc(S.exam.examType)} • ${esc(S.exam.subjectName)}</h3><p>ตรวจครบ ${r.scanned}/${r.total} คน • รอเฉลย ${r.waitingKey||0} คน • ค้าง PARTIAL ${r.partial} คน • จำนวนข้อ ${S.exam.numQuestions}</p><div class="row omr-v3-actions"><button id="xlsxDownload">ดาวน์โหลดคะแนน Excel (.xlsx)</button><button id="reportPrint" class="secondary">พิมพ์รายงานวิเคราะห์แบบ V3 (PDF)</button><button id="jumpToScores" class="secondary">ดูคะแนนรายบุคคล</button></div>${analysisHTML}<section class="omr-v3-individual" id="omrScores"><h3>คะแนนรายบุคคล</h3><div class="scroll"><table><thead><tr><th>ที่</th><th>รหัส</th><th>ชื่อ</th><th>ชั้น</th><th>คะแนน</th><th>สถานะ</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
 $('jumpToScores').onclick=()=>document.getElementById('omrScores')?.scrollIntoView({behavior:'smooth',block:'start'});
 $('xlsxDownload').onclick=()=>attempt(async()=>{
  if(!window.XLSX)throw Error('ยังโหลดไลบรารี Excel ไม่สำเร็จ');
  if(!await ExamUI.confirm('ดาวน์โหลดคะแนน Excel',`ส่งออก ${r.total} รายชื่อ • ตรวจแล้ว ${r.scanned} คน โดยไม่ใส่ 0 แทนผู้ที่ยังไม่ตรวจ`,'ดาวน์โหลด Excel'))return;
  const wb=XLSX.utils.book_new();const heads=['เลขประจำตัว','ชื่อ–นามสกุล','ชั้น','คะแนน','เต็ม','ร้อยละ','สถานะ'];
  const add=(students,name)=>{const table=[heads,...students.map(st=>[String(st.studentId),st.name,st.room,st.score??'',S.exam.numQuestions,st.score===null?'':Math.round(st.score/S.exam.numQuestions*10000)/100,st.status==='OK'?'ตรวจแล้ว':st.status==='PARTIAL'?'รอตรวจครบ':'ยังไม่ตรวจ'])];const ws=XLSX.utils.aoa_to_sheet(table);for(let i=1;i<table.length;i++){const addr=XLSX.utils.encode_cell({r:i,c:0});ws[addr].t='s';ws[addr].v=String(table[i][0]);}ws['!cols']=[{wch:18},{wch:35},{wch:14},{wch:12},{wch:10},{wch:12},{wch:16}];XLSX.utils.book_append_sheet(wb,ws,name.substring(0,31));};
  add(r.students,'คะแนนรวม');if(!$('reportRoom').value)[...new Set(r.students.map(st=>st.room))].forEach((room,i)=>add(r.students.filter(st=>st.room===room),('ห้อง '+room).replace(/[\/?*\[\]:]/g,'-')+' '+(i+1)));
  XLSX.writeFile(wb,'คะแนน-'+S.exam.subjectCode+'-'+S.exam.examType+'.xlsx');await ExamUI.alert('ส่งออกคะแนนเรียบร้อย',`ดาวน์โหลดข้อมูล ${r.total} คน โดยมีคะแนน ${r.scanned} คน`,'success');
 });
 $('reportPrint').onclick=()=>attempt(async()=>{
  if(!await ExamUI.confirm('พิมพ์รายงานวิเคราะห์แบบ V3',`พิมพ์ผลวิเคราะห์ ${r.scanned} คน และคะแนนรายบุคคล ${r.total} คน`,'เปิดรายงาน PDF'))return;
  omrPrintFullReport(r);ExamUI.toast('เปิดหน้าพิมพ์รายงานแล้ว','success');
 });
 message(`แสดงรายงาน ${r.scanned}/${r.total} คน`);
 return r;
}

async function compressEssayPhoto(file){
 if(!/^image\/(jpeg|png)$/.test(file.type))throw Error('รองรับเฉพาะ JPEG และ PNG');
 const bitmap=await createImageBitmap(file);const scale=Math.min(1,700/Math.max(bitmap.width,bitmap.height));
 const c=document.createElement('canvas');c.width=Math.round(bitmap.width*scale);c.height=Math.round(bitmap.height*scale);
 const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(bitmap,0,0,c.width,c.height);bitmap.close?.();
 let quality=.7,uri;do{uri=c.toDataURL('image/jpeg',quality);quality-=.1}while(uri.length>600000&&quality>.25);
 if(uri.length>600000)throw Error('ภาพมีขนาดใหญ่เกินไป กรุณาลดขนาดก่อนอัปโหลด');return uri;
}
