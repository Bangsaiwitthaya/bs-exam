'use strict';
window.ExamRoute=(()=>{
 let pending='create', current='home';
 const hide=id=>document.getElementById(id)?.classList.add('hidden');
 const show=id=>document.getElementById(id)?.classList.remove('hidden');
 function navigate(route){
  route=['home','create','print','scan','results'].includes(route)?route:'home';
  pending=route;current=route;stopCamera();
  document.querySelectorAll('[data-route]').forEach(b=>b.classList.toggle('active',b.dataset.route===route));
  if(route==='home'){show('homeDashboard');hide('loginPanel');hide('workspace');}
  else {hide('homeDashboard');if(S.teacher){hide('loginPanel');show('workspace');switchMode(route)}else{show('loginPanel');hide('workspace');}}
  window.scrollTo({top:0,behavior:'instant'});
 }
 function switchMode(route){
  document.getElementById('routeCreate').classList.toggle('hidden',route!=='create');
  document.getElementById('routeExam').classList.toggle('hidden',route==='create');
  document.getElementById('examPickerTitle').textContent=route==='print'?'เลือกข้อสอบเพื่อพิมพ์':route==='scan'?'เลือกข้อสอบเพื่อเฉลยและตรวจ':'เลือกข้อสอบเพื่อดูคะแนน';
  for(const [id,r] of [['printTools','print'],['scanTools','scan'],['resultsTools','results']])document.getElementById(id).classList.toggle('hidden',route!==r);
  if(S.exam)show('currentPanel');else hide('currentPanel');
  if(route==='scan'&&S.exam){const ready=S.exam.answerKey.length===S.exam.numQuestions;document.getElementById('keyStatus').textContent=ready?'มีเฉลยครบ':'รอเฉลย';document.getElementById('keySection').classList.toggle('hidden',ready);}
 }
 document.querySelectorAll('[data-route]').forEach(x=>x.addEventListener('click',()=>{navigate(x.dataset.route);if(x.dataset.route!=='home')ExamUI.toast('เปิดเมนู '+(x.textContent||'').trim(),'info') }));
 document.getElementById('create').addEventListener('click',()=>{ /* create flow chooses print when done */ });
 document.getElementById('keyToggle').addEventListener('click',()=>document.getElementById('keySection').classList.toggle('hidden'));
 document.getElementById('downloadPng').addEventListener('click',()=>attempt(async()=>{if(!S.exam)throw Error('กรุณาเลือกชุดข้อสอบก่อน');await OMRPrint.pngBlank(S.exam);ExamUI.toast('ดาวน์โหลดรูปภาพ PNG สำเร็จ')}));
 document.getElementById('pdfAutoRun').addEventListener('click',()=>attempt(()=>OMRBatch.processPdf(true)));
 document.getElementById('pdfRun').addEventListener('click',()=>attempt(()=>OMRBatch.processPdf()));
 return {navigate,afterLogin(){navigate(pending)},afterSelect(){switchMode(current);document.getElementById('currentPanel').scrollIntoView({behavior:'smooth'})},get current(){return current}};
})();
