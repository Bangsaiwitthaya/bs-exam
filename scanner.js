'use strict';
let omrLoopId=null,omrCandidate='',omrRepeat=0,omrMissing=0;
let omrResultOpen=false,omrAwaitRemoval=false,omrOverlayId=null,omrSavedThisSession=0;
function scanState(s){const el=document.getElementById('scanRunState');if(el)el.textContent=s;}
function scanStatus(result){
 $('scanExamLabel').textContent=`${S.exam.subjectName} • ${S.exam.examType}`;
 $('scanRoomLabel').textContent=`${S.exam.rooms.join(', ')} • ${S.exam.numQuestions} ข้อ`;
 $('scanDoneCount').textContent=String((Number(S.exam.scanned)||0)+omrSavedThisSession);
 $('scanRecentScore').textContent=result?.complete?`${result.score}/${result.fullScore}`:'—';
}
function setResultLock(locked){omrResultOpen=locked;scanState(locked?'กำลังแสดงผล':omrAwaitRemoval?'ยกกระดาษออกก่อน':'พร้อมสแกน');}
function resetResultOverlay(){if(omrOverlayId)clearTimeout(omrOverlayId);omrOverlayId=null;$('scanOverlay').classList.add('hidden');}
function showScanConfirmation(r){
 if(!S.stream)return;
 omrAwaitRemoval=true;
 const student=r.student||{},score=r.complete?`${r.score} / ${r.fullScore}`:'กำลังรอผลครบ';
 const body=`<div class="swal-scan-student">${esc(student.name)}</div><div class="swal-scan-meta">รหัส ${esc(student.studentId)} • ${esc(student.room)}</div><div class="swal-scan-score">${esc(score)}</div><div class="swal-scan-meta">บันทึกลงระบบเรียบร้อยแล้ว • กรุณายกกระดาษเดิมออก</div>`;
 const mode=$('scanNotifyMode').value;
 if(mode==='continuous'){
   $('scanOverlay').innerHTML=`<strong>${esc(student.name)} • ${esc(student.room)}</strong><b>${esc(score)}</b><small>บันทึกแล้ว • ยกกระดาษออกก่อนสแกนแผ่นถัดไป</small>`;
   $('scanOverlay').classList.remove('hidden');
   resetResultOverlayTimer();scanState('ยกกระดาษออกก่อน');
 }else{
   setResultLock(true);
   if(window.Swal?.fire){
     Swal.fire({icon:'success',title:'ตรวจข้อสอบสำเร็จ',html:body,confirmButtonText:'ตรวจแผ่นถัดไป',confirmButtonColor:'#1d4ed8',allowOutsideClick:false,allowEscapeKey:false}).then(()=>{setResultLock(false);scanState('ยกกระดาษออกก่อน');});
   }else{
     window.alert(`${student.name} (${student.room})\nคะแนน ${score}\nบันทึกเรียบร้อยแล้ว`);setResultLock(false);
   }
 }
}
function resetResultOverlayTimer(){if(omrOverlayId)clearTimeout(omrOverlayId);omrOverlayId=setTimeout(()=>{$('scanOverlay').classList.add('hidden');omrOverlayId=null;},3000);}

async function startCamera(){
 if(!S.exam)throw Error('กรุณาเลือกข้อสอบ');
 // ป้องกัน GitHub V4.4 คุยกับ Apps Script รุ่น 50 ข้อ/แผ่นซึ่งจะบันทึก PARTIAL
 let health;
 try{health=await api('health')}catch(e){throw Error('ไม่สามารถตรวจเวอร์ชัน Apps Script ได้ กรุณา Deploy OMR_Api.gs V4.4 เป็น New version ก่อนเปิดกล้อง ('+e.message+')')}
 if(!health?.onePage||Number(health.pageSize)!==100||health.release!=='4.4-singlepage')
   throw Error('Apps Script ที่ Deploy ยังไม่ตรงรุ่น V4.4 (ปัจจุบัน '+String(health?.release||'ไม่ทราบ')+') กรุณา Deploy เป็น New version ก่อนเริ่มสแกน เพื่อป้องกันคะแนนค้าง PARTIAL');
 if(Number(S.exam.totalPages)!==1)throw Error('API ส่งข้อมูลหลายแผ่นกลับมา กรุณาตรวจเวอร์ชันและเปิดชุดข้อสอบใหม่');
 if(S.exam.answerKey.length!==S.exam.numQuestions)throw Error('ต้องบันทึกเฉลยให้ครบก่อนเริ่มสแกน');
 if(!navigator.mediaDevices?.getUserMedia)throw Error('เบราว์เซอร์หรือ HTTPS ไม่รองรับกล้อง');
 if(!window.cv?.Mat||!window.jsQR)throw Error('OpenCV.js / jsQR ยังโหลดไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง');
 stopCamera();S.stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1600},height:{ideal:1200}}});
 $('video').srcObject=S.stream;await $('video').play();$('scanner').classList.remove('hidden');S.lastPaper='';omrCandidate='';omrRepeat=0;omrSavedThisSession=0;omrAwaitRemoval=false;omrResultOpen=false;scanStatus();scanState('พร้อมสแกน');message('เปิดกล้องแล้ว วางกระดาษให้อยู่ในภาพทั้งแผ่น');ExamUI.toast('เปิดกล้องแล้ว พร้อมสแกน','info');
 const loop=async()=>{if(!S.stream)return;if($('auto').checked&&!S.processing){try{await scanFrame()}catch(e){message(e.message||String(e),true)}}if(S.stream)omrLoopId=setTimeout(loop,1100)};loop();
}
function stopCamera(){resetResultOverlay();omrResultOpen=false;omrAwaitRemoval=false;omrCandidate='';omrRepeat=0;if(omrLoopId)clearTimeout(omrLoopId);omrLoopId=null;if(S.stream)S.stream.getTracks().forEach(t=>t.stop());S.stream=null;$('scanner').classList.add('hidden')}
function omrReadFrame(canvas,exam){
 const cv=window.cv;
 let original=null,gray=null,binary=null,contours=null,hierarchy=null,warped=null,warpedGray=null,src=null,dst=null,M=null;
 try{
  original=cv.imread(canvas);gray=new cv.Mat();cv.cvtColor(original,gray,cv.COLOR_RGBA2GRAY);
  binary=new cv.Mat();cv.threshold(gray,binary,105,255,cv.THRESH_BINARY_INV);
  contours=new cv.MatVector();hierarchy=new cv.Mat();cv.findContours(binary,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
  const candidates=[];
  for(let i=0;i<contours.size();i++){
   const c=contours.get(i);const area=cv.contourArea(c);const r=cv.boundingRect(c);
   if(area>90&&area<gray.cols*gray.rows*.025&&r.width>8&&r.height>8&&r.width/r.height>.72&&r.width/r.height<1.32&&area/(r.width*r.height)>.65){
    candidates.push({x:r.x+r.width/2,y:r.y+r.height/2,area});
   }
   c.delete();
  }
  if(candidates.length<4)return null;
  // วงทึบมุมกระดาษเป็นสี่เหลี่ยมพื้นที่ใกล้เคียงกัน และอยู่ห่างกันมาก
  const W=gray.cols,H=gray.rows;
  const pick=(score)=>candidates.slice().sort((a,b)=>score(a)-score(b))[0];
  const tl=pick(p=>p.x+p.y),tr=pick(p=>W-p.x+p.y),bl=pick(p=>p.x+H-p.y),br=pick(p=>W-p.x+H-p.y);
  if(new Set([tl,tr,bl,br]).size!==4)return null;
  const xdist=Math.hypot(tr.x-tl.x,tr.y-tl.y),ydist=Math.hypot(bl.x-tl.x,bl.y-tl.y);
  if(xdist<W*.22||ydist<H*.25)return null;
  const areas=[tl,tr,bl,br].map(p=>p.area);if(Math.max(...areas)/Math.min(...areas)>3.5)return null;
  const w=840,h=1188; // 4 px/mm, coordinate matches print.js
  src=cv.matFromArray(4,1,cv.CV_32FC2,[tl.x,tl.y,tr.x,tr.y,br.x,br.y,bl.x,bl.y]);
  dst=cv.matFromArray(4,1,cv.CV_32FC2,[14*4,14*4,196*4,14*4,196*4,283*4,14*4,283*4]);
  M=cv.getPerspectiveTransform(src,dst);warped=new cv.Mat();cv.warpPerspective(original,warped,M,new cv.Size(w,h),cv.INTER_LINEAR,cv.BORDER_CONSTANT,new cv.Scalar(255,255,255,255));
  warpedGray=new cv.Mat();cv.cvtColor(warped,warpedGray,cv.COLOR_RGBA2GRAY);
  // read QR from same rectified image
  const qrcanvas=document.createElement('canvas');qrcanvas.width=w;qrcanvas.height=h;cv.imshow(qrcanvas,warped);
  const ctx=qrcanvas.getContext('2d',{willReadFrequently:true});const im=ctx.getImageData(0,0,w,h);
  const qr=jsQR(im.data,w,h,{inversionAttempts:'dontInvert'});
  let qrExam='',qrStudent='',qrPage=0;if(qr?.data?.startsWith('BSOMR2|')){const a=qr.data.split('|');qrExam=a[1];qrStudent=a[2]||'';qrPage=Number(a[3])||0;}
  function darkRatio(xmm,ymm,rmm){
    const x=Math.round(xmm*4),y=Math.round(ymm*4),R=Math.round(rmm*4);let count=0,dark=0;
    for(let yy=-R;yy<=R;yy++)for(let xx=-R;xx<=R;xx++)if(xx*xx+yy*yy<=R*R){let X=x+xx,Y=y+yy;if(X>=0&&X<w&&Y>=0&&Y<h){count++;if(warpedGray.ucharPtr(Y,X)[0]<135)dark++}}
    return count?dark/count:0;
  }
  const choice=[...exam.choiceSet];let answers=[],uncertain=[];
  const pageNo=1;const start=0;const pageCount=Number(exam.numQuestions);
  if(qrPage && qrPage!==1)throw Error('กระดาษคำตอบเป็นรูปแบบเก่า โปรดพิมพ์ใหม่');
  const layout=OMRLayout.forCount(pageCount);
  for(let q=0;q<pageCount;q++){ 
    const ratios=choice.map((_,j)=>{const pt=layout.position(q,j);return darkRatio(pt.x,pt.y,layout.radius*0.53)});
    const marked=ratios.map((v,i)=>({v,i})).filter(x=>x.v>.30).sort((a,b)=>b.v-a.v);
    if(marked.length===1)answers.push(choice[marked[0].i]);
    else if(marked.length===0 && Math.max(...ratios)<.13)answers.push('');
    else{answers.push('');uncertain.push(q+1)}
  }
  // numeric ID grid (5 digits, optional redundancy for named and blank papers)
  let digits='',idReadable=true;
  for(let d=0;d<5;d++){
    const id=OMRLayout.student;
    const ratios=Array.from({length:10},(_,r)=>darkRatio(id.x0+d*id.dx,id.y0+r*id.dy,id.r*0.64));
    const marked=ratios.map((v,i)=>({v,i})).filter(x=>x.v>.40);
    if(marked.length===1)digits+=marked[0].i;else idReadable=false;
  }
  return {qrExam,qrStudent,qrPage,pageNo,studentDigits:idReadable?digits:'',answers,uncertain:uncertain.map(x=>x+start)};
 }finally{for(const o of [original,gray,binary,contours,hierarchy,warped,warpedGray,src,dst,M])if(o)o.delete()}
}
async function scanFrame(){
 if(!S.stream||S.processing||omrResultOpen)return;
 S.processing=true;
 try{
  const video=$('video');if(video.readyState<2)return;
  const cvs=$('capture');const max=1800,scale=Math.min(1,max/video.videoWidth);cvs.width=Math.round(video.videoWidth*scale);cvs.height=Math.round(video.videoHeight*scale);
  cvs.getContext('2d',{willReadFrequently:true}).drawImage(video,0,0,cvs.width,cvs.height);
  const read=omrReadFrame(cvs,S.exam);
  if(!read){omrMissing++;if(omrMissing>=2){S.lastPaper='';omrCandidate='';omrRepeat=0;if(omrAwaitRemoval&&!omrResultOpen){omrAwaitRemoval=false;scanState('พร้อมสแกน');}}return;}
  omrMissing=0;
  if(omrAwaitRemoval){scanState('ยกกระดาษออกก่อน');return;}
  await handleOMRRead(read,false);
 }finally{S.processing=false}
}
/** Shared between phone camera and scanned-PDF input. Never silently replaces scores. */
async function handleOMRRead(read,fromPdf=false){
 if(read.qrExam && read.qrExam!==S.exam.examId)throw Error('กระดาษเป็นคนละชุดข้อสอบ');
 const matched=read.studentDigits?S.students.filter(s=>String(s.studentId).padStart(5,'0')===read.studentDigits):[];
 const studentId=read.qrStudent|| (matched.length===1?matched[0].studentId:'') || (fromPdf?'':$('manualStudent').value);
 if(read.qrStudent && matched.length===1 && matched[0].studentId!==read.qrStudent)throw Error('รหัสวงดำไม่ตรงกับ QR');
 if(!studentId)throw Error('อ่านรหัสนักเรียนไม่ได้');
 if(read.uncertain.length)throw Error('คำตอบไม่ชัด/ฝนหลายตัวเลือก ข้อ '+read.uncertain.join(', '));
 if(!read.answers.some(Boolean))throw Error('ระบบอ่านคำตอบเป็นช่องว่างทั้งหมด กรุณาจัดแสงและระยะกล้องใหม่ (ยังไม่บันทึกคะแนน)');
 const signature=studentId+'|1|'+read.answers.join(',');
 if(!fromPdf){
  if(omrResultOpen||omrAwaitRemoval)return {status:'waiting-removal'};
  if(omrCandidate===signature)omrRepeat++;else{omrCandidate=signature;omrRepeat=1;}
  if(omrRepeat<2){message('กำลังยืนยันผลภาพอีกครั้ง');return {status:'unstable'}};
  if(S.lastPaper===studentId+'|1')return {status:'same-paper'};
  S.lastPaper=studentId+'|1';
 }
 const result=await api('scan',{examId:S.exam.examId,studentId,pageNo:1,answers:read.answers});
 if(result.duplicate){
  if(fromPdf)return {status:'duplicate',studentId};
  omrAwaitRemoval=true;setResultLock(true);
  let didReplace=false;
  try{
   const choice=window.Swal?.fire?await Swal.fire({icon:'warning',title:'กระดาษนี้ตรวจแล้ว',html:`<strong>${esc(result.student.name)}</strong><br>${esc(result.student.room)} • คะแนนเดิม ${esc(result.previous.score)}<br><small>ต้องการตรวจซ้ำและแทนคะแนนเดิมหรือไม่?</small>`,showCancelButton:true,confirmButtonText:'ตรวจซ้ำและแทนคะแนน',cancelButtonText:'ข้ามแผ่นนี้',confirmButtonColor:'#b45309',reverseButtons:true,allowOutsideClick:false}):{isConfirmed:window.confirm('ตรวจแล้ว: '+result.student.name+' คะแนน '+result.previous.score+' ตรวจซ้ำหรือไม่?')};
   if(choice.isConfirmed){
    const replacement=await api('scan',{examId:S.exam.examId,studentId,pageNo:1,answers:read.answers,replace:true,expectedRevision:result.previous.revision});
    if(!replacement.complete)throw Error('เซิร์ฟเวอร์ยังไม่ยืนยันผลการตรวจซ้ำ');
    didReplace=true;showSaved(replacement,{replacement:true});
   }else message('ข้ามกระดาษที่ตรวจแล้ว ยกกระดาษออกก่อนแผ่นถัดไป');
  }finally{if(!didReplace){setResultLock(false);scanState('ยกกระดาษออกก่อน');}}
  return {status:'duplicate',studentId};
 }
 if(!result.complete)throw Error('เซิร์ฟเวอร์บันทึกเป็น PARTIAL ไม่ใช่ผลตรวจสมบูรณ์ กรุณาตรวจว่าติดตั้ง Apps Script V4.4 และเลือกตรวจสอบผลค้างในหน้ารายงาน');
 if(!fromPdf)showSaved(result);
 return {status:'saved',studentId,score:result.score};
}
function showSaved(r,{replacement=false}={}){
 $('scanResult').innerHTML=`<div class="card"><div class="sub">บันทึกคะแนนสำเร็จ</div><h3>${esc(r.student.name)} — ${esc(r.student.room)}</h3><div class="score">${r.complete?r.score+' / '+r.fullScore:'แผ่น '+r.pageNo+'/'+r.totalPages+' = '+r.pageScore+' คะแนน'}</div><p class="sub">${r.complete?'ตรวจครบทุกแผ่นแล้ว':'ยังรอแผ่นอื่น จึงยังไม่คิดคะแนนรวม'} • รหัส ${esc(r.student.studentId)} • บันทึกครั้งที่ ${r.revision}</p></div>`;
 $('scanResult').insertAdjacentHTML('beforeend','<p><button id="viewUpdatedReport" class="secondary">ดูคะแนนและวิเคราะห์อัตโนมัติ</button></p>');$('viewUpdatedReport').onclick=()=>attempt(async()=>{await showReport();$('report').scrollIntoView({behavior:'smooth'})});
 if(!replacement)omrSavedThisSession++;scanStatus(r);showScanConfirmation(r);
 message(`บันทึกแผ่น ${r.pageNo}/${r.totalPages} ของ ${r.student.name} ${r.complete?'รวม '+r.score+'/'+r.fullScore:'รอแผ่นถัดไป'} กรุณายกกระดาษออกก่อนสแกนแผ่นใหม่`);
 try{if(window.speechSynthesis){window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(r.complete?'ตรวจครบแล้ว '+r.score+' คะแนน':'บันทึกแผ่นที่ '+r.pageNo+' แล้ว');u.lang='th-TH';u.rate=1.1;window.speechSynthesis.speak(u)}}catch(_){}
}
