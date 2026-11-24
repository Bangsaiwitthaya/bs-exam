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
  S.exam.answerKey=key;S.exam.status='READY';$('keyStatus').textContent='มีเฉลยครบ';$('keySection').classList.add('hidden');message('บันทึกเฉลยเรียบร้อย '+(r.regraded?`คำนวณใหม่ ${r.regraded} คน`:''));ExamUI.toast('บันทึกเฉลยสำเร็จ'+(r.regraded?' และคำนวณคะแนนใหม่':''));await listExams();
});
$('printNamed').onclick=()=>attempt(()=>{if(!S.students.length)throw Error('ไม่พบรายชื่อนักเรียน');OMRPrint.print(S.exam,S.students);ExamUI.alert('เปิดหน้าพิมพ์แล้ว','กระดาษรายบุคคล '+S.students.length+' แผ่น กรุณาพิมพ์ขนาด 100%','success')});
$('printBlank').onclick=()=>attempt(()=>{let n=Math.floor(Number($('blankCount').value));if(n<1||n>100)throw Error('จำนวน 1–100 แผ่น');OMRPrint.print(S.exam,Array.from({length:n},()=>null));ExamUI.alert('เปิดหน้าพิมพ์แล้ว','กระดาษเปล่า '+n+' แผ่น กรุณาพิมพ์ขนาด 100%','success')});
$('scanStart').onclick=()=>attempt(async()=>{if(!await ExamUI.confirm('เริ่มตรวจด้วยกล้อง','ระบบจะอ่าน QR/รหัสนักเรียนและช่องคำตอบในครั้งเดียว กรุณาตรวจเฉลยให้ถูกต้องก่อนเริ่ม','เปิดกล้อง'))return;await startCamera()});
$('scanStop').onclick=()=>{stopCamera();ExamUI.toast('ปิดกล้องแล้ว','info')};
$('snap').onclick=()=>attempt(scanFrame);
$('reportButton').onclick=()=>attempt(showReport);
$('repairPartials').onclick=()=>attempt(async()=>{
 if(!S.exam)throw Error('กรุณาเลือกชุดข้อสอบก่อน');
 if(!await ExamUI.confirm('ตรวจสอบข้อมูลที่ค้าง PARTIAL','ระบบจะตรวจเฉพาะผลเก่าที่มีคำตอบครบทั้งแผ่นและไม่ว่างทั้งหมด รายการที่ข้อมูลไม่ครบจะไม่แตะต้อง และต้องสแกนใหม่','ตรวจสอบและซ่อม'))return;
 ExamUI.busy('กำลังตรวจสอบข้อมูลค้าง...');let res;try{res=await api('repairPartials',{examId:S.exam.examId,confirm:true})}finally{ExamUI.close()}
 const review=res.review.map(x=>x.studentId).join(', ');
 await ExamUI.alert('ตรวจสอบข้อมูลค้างเรียบร้อย',`ซ่อมสำเร็จ ${res.repaired.length} คน • ต้องสแกนใหม่ ${res.review.length} คน${review?'\nรหัส: '+review:''}`,res.review.length?'warning':'success');
 await showReport();
});
$('reportRoom').onchange=()=>attempt(showReport);
$('finalize').onclick=()=>attempt(async()=>{
 if(!await ExamUI.confirm('เก็บผลวิเคราะห์ย้อนหลัง','บันทึกผลวิเคราะห์รวมทุกห้อง ณ ขณะนี้เป็นรายงานย้อนหลัง?','บันทึกรายงาน'))return;
 ExamUI.busy('กำลังเก็บรายงานย้อนหลัง...');let r;try{r=await api('finalize',{examId:S.exam.examId})}finally{ExamUI.close()}
 ExamUI.toast(r.alreadySaved?'มีรายงานนี้แล้ว':'เก็บผลวิเคราะห์สำเร็จ');message('เก็บรายงานย้อนหลังแล้ว รหัส '+r.analysisId+(r.alreadySaved?' (เคยบันทึกแล้ว)':''));
 await openExam(S.exam.examId);
});
async function showReport(){
  const r=await api('report',{examId:S.exam.examId,room:$('reportRoom').value});if(!$('reportRoom').value)S.exam.scanned=r.scanned;
  const rows=r.students.map((s,i)=>`<tr><td>${i+1}</td><td>${esc(s.studentId)}</td><td>${esc(s.name)}</td><td>${esc(s.room)}</td><td>${s.score===null?'—':s.score+' / '+S.exam.numQuestions}</td><td>${s.status==='OK'?'ครบแล้ว':s.status==='PARTIAL'?'ยังไม่ครบ (แผ่น '+s.pagesDone.join(', ')+')':'รอตรวจ'}</td></tr>`).join('');
  const analysis=r.analysis;
  let a='';if(analysis){a=`<h3>วิเคราะห์อัตโนมัติ (${r.scanned} คนที่ตรวจครบทุกแผ่น)</h3><p class="sub">คำนวณจากคำตอบที่สแกนแล้ว ไม่ต้องกรอกข้อมูลซ้ำ • ข้อมูลนี้จะเปลี่ยนตามผลตรวจล่าสุด</p><p>เฉลี่ย ${esc(analysis.scoreSummary.mean)} | S.D. ${esc(analysis.scoreSummary.sd)} | KR-20 ${esc(analysis.kr20)} | ข้อที่ใช้ได้ดี ${analysis.qualitySummary.goodItems}</p><div class="scroll"><table><tr><th>ข้อ</th><th>เฉลย</th><th>p</th><th>r</th><th>ผล</th></tr>${analysis.analysis.map(v=>`<tr><td>${v.item}</td><td>${esc(v.correctChoice)}</td><td>${v.p}</td><td>${v.r}</td><td>${esc(v.interpretation)}</td></tr>`).join('')}</table></div>`;}
  $('report').innerHTML=`<h3>รายงานคะแนน ${esc(S.exam.examType)} • ${esc(S.exam.subjectName)}</h3><p>ตรวจครบ ${r.scanned}/${r.total} คน • รออีกแผ่น ${r.partial} คน • จำนวนข้อ ${S.exam.numQuestions}</p><div class="row"><button id="xlsxDownload">ดาวน์โหลดคะแนน Excel (.xlsx)</button><button id="reportPrint" class="secondary">พิมพ์รายงานวิเคราะห์ PDF</button></div><table><tr><th>ที่</th><th>รหัส</th><th>ชื่อ</th><th>ชั้น</th><th>คะแนน</th><th>สถานะ</th></tr>${rows}</table>${a}`;
  $('xlsxDownload').onclick=()=>{
    if(!window.XLSX)throw Error('ยังโหลดไลบรารี Excel ไม่สำเร็จ');
    const wb=XLSX.utils.book_new();const heads=['เลขประจำตัว','ชื่อ–นามสกุล','ชั้น','คะแนน','เต็ม','ร้อยละ','สถานะ'];
    const add=(rows,name)=>{
      const table=[heads,...rows.map(s=>[String(s.studentId),s.name,s.room,s.score??'',S.exam.numQuestions,s.score===null?'':Math.round(s.score/S.exam.numQuestions*10000)/100,s.status==='OK'?'ตรวจแล้ว':'ยังไม่ตรวจ'])];
      const ws=XLSX.utils.aoa_to_sheet(table);
      for(let i=1;i<table.length;i++){const addr=XLSX.utils.encode_cell({r:i,c:0});ws[addr].t='s';ws[addr].v=String(table[i][0]);}
      ws['!cols']=[{wch:18},{wch:35},{wch:14},{wch:12},{wch:10},{wch:12},{wch:16}];
      XLSX.utils.book_append_sheet(wb,ws,name.substring(0,31));
    };
    add(r.students,'คะแนนรวม');
    if(!$('reportRoom').value){[...new Set(r.students.map(s=>s.room))].forEach((room,i)=>add(r.students.filter(s=>s.room===room),('ห้อง '+room).replace(/[\/?*\[\]:]/g,'-')+' '+(i+1)));}
    XLSX.writeFile(wb,'คะแนน-'+S.exam.subjectCode+'-'+S.exam.examType+'.xlsx');ExamUI.toast('ดาวน์โหลด Excel สำเร็จ');
  };
  $('reportPrint').onclick=()=>{
    const w=window.open('','_blank');if(!w)throw Error('กรุณาอนุญาต Pop-up');
    const h=esc;const an=r.analysis;
    const itemRows=an?an.analysis.map(v=>`<tr><td>${v.item}</td><td>${h(v.correctChoice)}</td><td>${v.p}</td><td>${v.r}</td><td>${h(v.difficultyLevel)}</td><td>${h(v.discriminationLevel)}</td><td>${h(v.interpretation)}</td><td>${h(v.reason)}</td></tr>`).join(''):'';
    const analysisSection=an?`<h2>รายงานวิเคราะห์คุณภาพข้อสอบ</h2><p>ค่าเฉลี่ย ${h(an.scoreSummary.mean)} • S.D. ${h(an.scoreSummary.sd)} • KR-20 ${h(an.kr20)} • ใช้ได้ดี ${an.qualitySummary.goodItems} ข้อ</p><table><thead><tr><th>ข้อ</th><th>เฉลย</th><th>p</th><th>r</th><th>ระดับความยาก</th><th>อำนาจจำแนก</th><th>คุณภาพ</th><th>เหตุผล</th></tr></thead><tbody>${itemRows}</tbody></table>`:'<p>ยังไม่มีผู้เข้าสอบที่ตรวจเสร็จ</p>';
    const body=`<h1>โรงเรียนบางไทรวิทยา</h1><h2>รายงานผลการตรวจข้อสอบปรนัย</h2><p>รายวิชา ${h(S.exam.subjectName)} (${h(S.exam.subjectCode)}) • ${h(S.exam.examType)} • ${h(S.exam.semester)}/${h(S.exam.academicYear)} • ห้อง ${h($('reportRoom').value||'รวมทุกห้อง')}</p><p>ตรวจแล้ว ${r.scanned} / ${r.total} คน</p><table><thead><tr><th>รหัสนักเรียน</th><th>ชื่อ–นามสกุล</th><th>ชั้น</th><th>คะแนน</th><th>เต็ม</th><th>ร้อยละ</th></tr></thead><tbody>${r.students.map(st=>`<tr><td>${h(st.studentId)}</td><td>${h(st.name)}</td><td>${h(st.room)}</td><td>${st.score===null?'—':st.score}</td><td>${S.exam.numQuestions}</td><td>${st.score===null?'—':(st.score/S.exam.numQuestions*100).toFixed(2)}</td></tr>`).join('')}</tbody></table><div class="newpage">${analysisSection}</div>`;
    w.document.open();w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>รายงานผลการตรวจและวิเคราะห์ข้อสอบ</title><style>@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');@page{size:A4 portrait;margin:12mm}body{font-family:Sarabun,sans-serif;color:#172b4d}h1{font-size:15pt;text-align:center;margin:0}h2{font-size:13pt;text-align:center}p{font-size:10pt}table{width:100%;border-collapse:collapse}td,th{font-size:8pt;padding:4px;border:1px solid #aaa;word-wrap:break-word}th{background:#fff;font-weight:bold}tr{break-inside:avoid}.newpage{break-before:page}</style></head><body>${body}</body></html>`);w.document.close();Promise.resolve(w.document.fonts?.ready).then(()=>{w.focus();w.print()});
  };
  message(`แสดงรายงาน ${r.scanned}/${r.total} คน`);ExamUI.toast('โหลดคะแนนและผลวิเคราะห์แล้ว','info');
}

async function compressEssayPhoto(file){
 if(!/^image\/(jpeg|png)$/.test(file.type))throw Error('รองรับเฉพาะ JPEG และ PNG');
 const bitmap=await createImageBitmap(file);const scale=Math.min(1,700/Math.max(bitmap.width,bitmap.height));
 const c=document.createElement('canvas');c.width=Math.round(bitmap.width*scale);c.height=Math.round(bitmap.height*scale);
 const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(bitmap,0,0,c.width,c.height);bitmap.close?.();
 let quality=.7,uri;do{uri=c.toDataURL('image/jpeg',quality);quality-=.1}while(uri.length>600000&&quality>.25);
 if(uri.length>600000)throw Error('ภาพมีขนาดใหญ่เกินไป กรุณาลดขนาดก่อนอัปโหลด');return uri;
}
