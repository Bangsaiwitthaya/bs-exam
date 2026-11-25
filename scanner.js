'use strict';
let omrLoopId=null,omrCandidate='',omrRepeat=0,omrMissing=0;
let omrResultOpen=false,omrAwaitRemoval=false,omrOverlayId=null,omrSavedThisSession=0;
let omrTorchTrack=null,omrTorchOn=false;
// Display only: observed image-processing time; no server performance claims.
let omrProcessMs=0;
let omrReviewPending=false; // Prevent another camera read while the teacher reviews the marked answer image.

function scanState(s){const el=document.getElementById('scanRunState');if(el)el.textContent=s;}
function scanStatus(result){
 $('scanExamLabel').textContent=S.autoMode?'สแกนอัตโนมัติ QR • '+(S.exam?.subjectName||'ทุกวิชา'):`${S.exam.subjectName} • ${S.exam.examType}`;
 $('scanRoomLabel').textContent=S.exam?`${S.exam.rooms.join(', ')} • ${S.exam.numQuestions} ข้อ`:'อ่าน QR เพื่อระบุวิชาและนักเรียน';
 $('scanDoneCount').textContent=String((S.autoMode?0:Number(S.exam?.scanned)||0)+omrSavedThisSession);
 $('scanRecentScore').textContent=result?.awaitingKey?'รอเฉลย':result?.complete?`${result.score}/${result.fullScore}`:'—';
}
function setResultLock(locked){omrResultOpen=locked;scanState(locked?'กำลังแสดงผล':omrAwaitRemoval?'ยกกระดาษออกก่อน':'พร้อมสแกน');}
function resetResultOverlay(){if(omrOverlayId)clearTimeout(omrOverlayId);omrOverlayId=null;$('scanOverlay').classList.add('hidden');}
function showScanConfirmation(r){
 if(!S.stream)return;
 omrAwaitRemoval=true;
 const student=r.student||{},score=r.awaitingKey?'บันทึกคำตอบแล้ว • รอเฉลย':r.complete?`${r.score} / ${r.fullScore}`:'กำลังรอผลครบ';
 const body=`<div class="swal-scan-meta">${esc(r.subjectName||S.exam?.subjectName||'')}</div><div class="swal-scan-student">${esc(student.name)}</div><div class="swal-scan-meta">รหัส ${esc(student.studentId)} • ${esc(student.room)}</div><div class="swal-scan-score">${esc(score)}</div><div class="swal-scan-meta">บันทึกลงระบบเรียบร้อยแล้ว • กรุณายกกระดาษเดิมออก</div>`;
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

// Torch support varies by device, browser and camera. Never assume iOS supports torch.
function updateTorchUi(note){
 const b=document.getElementById('scanTorch'),n=document.getElementById('torchNote');
 if(!b)return;
 const supported=!!(omrTorchTrack?.getCapabilities?.().torch);
 b.disabled=!supported;b.textContent=supported?(omrTorchOn?'ไฟแฟลช: เปิดอยู่':'ไฟแฟลช: ปิดอยู่'):'ไฟแฟลช: ไม่รองรับ';
 b.setAttribute('aria-pressed',String(omrTorchOn));
 if(n)n.textContent=note||(supported?'ใช้ไฟแฟลชเมื่อแสงไม่พอ; ระวังแสงสะท้อนบนกระดาษ':'มือถือ/เบราว์เซอร์นี้ไม่เปิดไฟแฟลชผ่านเว็บได้');
}
async function toggleOmrTorch(){
 const track=omrTorchTrack;if(!track?.getCapabilities?.().torch)return updateTorchUi();
 try{await track.applyConstraints({advanced:[{torch:!omrTorchOn}]});omrTorchOn=!omrTorchOn;updateTorchUi()}
 catch(e){omrTorchOn=false;updateTorchUi('ไม่สามารถเปิดไฟแฟลชได้: '+e.message);ExamUI?.toast?.('อุปกรณ์นี้ไม่อนุญาตเปิดไฟแฟลชผ่านเว็บ','warning')}
}
async function startCamera(autoMode=false){
 if(!autoMode&&!S.exam)throw Error('กรุณาเลือกข้อสอบ');
 S.autoMode=!!autoMode;
 if(autoMode){S.exam=null;S.students=[];$('currentPanel').classList.remove('hidden');$('scanTools').classList.remove('hidden');$('examTitle').textContent='สแกนอัตโนมัติจาก QR • ทุกวิชา';$('examMeta').textContent='ไม่ต้องเลือกชุดข้อสอบ • เก็บคำตอบได้แม้ยังไม่มีเฉลย';}
 // ป้องกัน GitHub V4.4 คุยกับ Apps Script รุ่น 50 ข้อ/แผ่นซึ่งจะบันทึก PARTIAL
 let health;
 try{health=await api('health')}catch(e){throw Error('ไม่สามารถตรวจเวอร์ชัน Apps Script ได้ กรุณา Deploy OMR_Api.gs V4.4 เป็น New version ก่อนเปิดกล้อง ('+e.message+')')}
 if(autoMode&&health?.fix!=='4.13-autoqr-latekey')throw Error('กรุณา Deploy Apps Script V4.13 ก่อนเปิดโหมด QR อัตโนมัติ');
 if(!health?.onePage||Number(health.pageSize)!==100||health.release!=='4.4-singlepage')
   throw Error('Apps Script ที่ Deploy ยังไม่ตรงรุ่น V4.4 (ปัจจุบัน '+String(health?.release||'ไม่ทราบ')+') กรุณา Deploy เป็น New version ก่อนเริ่มสแกน เพื่อป้องกันคะแนนค้าง PARTIAL');
 if(!autoMode&&Number(S.exam.totalPages)!==1)throw Error('API ส่งข้อมูลหลายแผ่นกลับมา กรุณาตรวจเวอร์ชันและเปิดชุดข้อสอบใหม่');
 // Scanned answers are stored as WAIT_KEY if the teacher has not supplied an answer key.
 if(!navigator.mediaDevices?.getUserMedia)throw Error('เบราว์เซอร์หรือ HTTPS ไม่รองรับกล้อง');
 if(!window.cv?.Mat||!window.jsQR)throw Error('OpenCV.js / jsQR ยังโหลดไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง');
 stopCamera();S.autoMode=!!autoMode;S.stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1600},height:{ideal:1200}}});
 omrTorchTrack=S.stream.getVideoTracks()[0]||null;omrTorchOn=false;updateTorchUi();$('video').srcObject=S.stream;await $('video').play();$('scanner').classList.remove('hidden');S.lastPaper='';omrCandidate='';omrRepeat=0;omrSavedThisSession=0;omrAwaitRemoval=false;omrResultOpen=false;omrReviewPending=false;scanStatus();scanState('พร้อมสแกน');message('เปิดกล้องแล้ว วางกระดาษให้อยู่ในภาพทั้งแผ่น');ExamUI.toast('เปิดกล้องแล้ว พร้อมสแกน','info');
 const loop=async()=>{if(!S.stream)return;if($('auto').checked&&!S.processing&&!omrResultOpen&&!omrReviewPending){try{await scanFrame()}catch(e){message(e.message||String(e),true)}}if(S.stream)omrLoopId=setTimeout(loop,550)};loop();
}
function stopCamera(){omrTorchTrack=null;omrTorchOn=false;updateTorchUi('ปิดกล้องแล้ว');resetResultOverlay();omrResultOpen=false;omrAwaitRemoval=false;omrReviewPending=false;omrCandidate='';omrRepeat=0;if(omrLoopId)clearTimeout(omrLoopId);omrLoopId=null;if(S.stream)S.stream.getTracks().forEach(t=>t.stop());S.stream=null;$('scanner').classList.add('hidden')}
function omrReadFrame(canvas,exam,manualCorners=null){
 const cv=window.cv;
 let original=null,gray=null,binary=null,contours=null,hierarchy=null,warped=null,warpedGray=null,warpedAdaptive=null,qrCrop=null,src=null,dst=null,M=null;
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
  if(candidates.length<4 && !manualCorners)return null;
  // วงทึบมุมกระดาษเป็นสี่เหลี่ยมพื้นที่ใกล้เคียงกัน และอยู่ห่างกันมาก
  const W=gray.cols,H=gray.rows;
  const pick=(score)=>candidates.slice().sort((a,b)=>score(a)-score(b))[0];
  const tl=pick(p=>p.x+p.y),tr=pick(p=>W-p.x+p.y),bl=pick(p=>p.x+H-p.y),br=pick(p=>W-p.x+H-p.y);
  if(!manualCorners){
   if(new Set([tl,tr,bl,br]).size!==4)return null;
   const xdist=Math.hypot(tr.x-tl.x,tr.y-tl.y),ydist=Math.hypot(bl.x-tl.x,bl.y-tl.y);
   if(xdist<W*.22||ydist<H*.25)return null;
   const areas=[tl,tr,bl,br].map(p=>p.area);if(Math.max(...areas)/Math.min(...areas)>3.5)return null;
  }
  const w=840,h=1188; // 4 px/mm, coordinate matches print.js
  // PDF repair: allow teacher to mark centers of all 4 registration squares manually.
  // Coordinates are in the original rasterized PDF page pixel space.
  const points=manualCorners ? manualCorners : [tl,tr,br,bl];
  if(points.length!==4 || points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw Error('กรุณาระบุจุดมาร์กทั้ง 4 มุม');
  src=cv.matFromArray(4,1,cv.CV_32FC2,points.flatMap(p=>[p.x,p.y]));
  dst=cv.matFromArray(4,1,cv.CV_32FC2,[14*4,14*4,196*4,14*4,196*4,283*4,14*4,283*4]);
  M=cv.getPerspectiveTransform(src,dst);warped=new cv.Mat();cv.warpPerspective(original,warped,M,new cv.Size(w,h),cv.INTER_LINEAR,cv.BORDER_CONSTANT,new cv.Scalar(255,255,255,255));
  warpedGray=new cv.Mat();cv.cvtColor(warped,warpedGray,cv.COLOR_RGBA2GRAY);
  // Only decode the QR area (20..45 mm by 55..80 mm), not a full 840x1188-pixel image.
  // Generous margin allows for print scaling and minor misregistration.
  const qrRect=new cv.Rect(15*4,50*4,40*4,40*4);
  qrCrop=warped.roi(qrRect);
  const qrcanvas=document.createElement('canvas');qrcanvas.width=qrRect.width;qrcanvas.height=qrRect.height;
  cv.imshow(qrcanvas,qrCrop);
  const ctx=qrcanvas.getContext('2d',{willReadFrequently:true});const im=ctx.getImageData(0,0,qrRect.width,qrRect.height);
  const qr=jsQR(im.data,qrRect.width,qrRect.height,{inversionAttempts:'dontInvert'});
  // Local threshold handles pale graphite marks and uneven illumination much better
  // than the previous fixed gray<135 criterion. Printed bubble outlines stay outside
  // the smaller central sampling disk.
  warpedAdaptive=new cv.Mat();
  cv.adaptiveThreshold(warpedGray,warpedAdaptive,255,cv.ADAPTIVE_THRESH_GAUSSIAN_C,cv.THRESH_BINARY_INV,35,9);
  let qrExam='',qrStudent='',qrPage=0;if(qr?.data?.startsWith('BSOMR2|')){const a=qr.data.split('|');qrExam=a[1];qrStudent=a[2]||'';qrPage=Number(a[3])||0;}
  if(!exam)return {qrExam,qrStudent,qrPage}; // Identify sheet before loading its scoring layout.
  function darkRatio(xmm,ymm,rmm){
    const x=Math.round(xmm*4),y=Math.round(ymm*4),R=Math.round(rmm*4);let count=0,dark=0;
    for(let yy=-R;yy<=R;yy++)for(let xx=-R;xx<=R;xx++)if(xx*xx+yy*yy<=R*R){let X=x+xx,Y=y+yy;if(X>=0&&X<w&&Y>=0&&Y<h){count++;if(warpedAdaptive.ucharPtr(Y,X)[0]>0)dark++}}
    return count?dark/count:0;
  }
  const choice=[...exam.choiceSet];let answers=[],uncertain=[];
  const pageNo=1;const start=0;const pageCount=Number(exam.numQuestions);
  if(qrPage && qrPage!==1)throw Error('กระดาษคำตอบเป็นรูปแบบเก่า โปรดพิมพ์ใหม่');
  const layout=OMRLayout.forCount(pageCount);
  for(let q=0;q<pageCount;q++){ 
    const ratios=choice.map((_,j)=>{const pt=layout.position(q,j);return darkRatio(pt.x,pt.y,layout.radius*0.53)});
    // Less strict than the old 0.30 fill cutoff, but require a clear winner.
    // This avoids silently treating two genuinely dark bubbles as one answer.
    const ranked=ratios.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v);
    const top=ranked[0],next=ranked[1]||{v:0};
    const clear=top.v>=0.22 && (top.v-next.v)>=0.11 && (next.v===0||top.v/Math.max(next.v,0.01)>=1.38);
    if(clear)answers.push(choice[top.i]);
    else if(top.v<0.12)answers.push('');
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
  // Capture a normalized image for the review overlay. The QR and bubbles stay at
  // known A4 coordinates, so indicator rings cannot drift when the phone is tilted.
  const previewCanvas=document.createElement('canvas');
  cv.imshow(previewCanvas,warped);
  const previewImage=previewCanvas.toDataURL('image/jpeg',0.78);
  return {qrExam,qrStudent,qrPage,pageNo,studentDigits:idReadable?digits:'',answers,uncertain:uncertain.map(x=>x+start),previewImage};
 }finally{for(const o of [original,gray,binary,contours,hierarchy,warped,warpedGray,warpedAdaptive,qrCrop,src,dst,M])if(o)o.delete()}
}
async function scanFrame(){
 if(!S.stream||S.processing||omrResultOpen||omrReviewPending)return;
 S.processing=true;
 try{
  const video=$('video');if(video.readyState<2)return;
  const cvs=$('capture');const max=1280,scale=Math.min(1,max/video.videoWidth);cvs.width=Math.round(video.videoWidth*scale);cvs.height=Math.round(video.videoHeight*scale);
  cvs.getContext('2d',{willReadFrequently:true}).drawImage(video,0,0,cvs.width,cvs.height);
  const started=performance.now();
  let read;
  if(S.autoMode){
   const probe=omrReadFrame(cvs,S.exam);
   if(!probe?.qrExam){scanState('รอ QR และจุดมาร์กทั้ง 4 มุม');return;}
   if(!S.exam||S.exam.examId!==probe.qrExam){
     scanState('กำลังโหลดชุดข้อสอบจาก QR');
     const resolved=await api('resolveQr',{examId:probe.qrExam});
     S.students=resolved.students;delete resolved.students;S.exam=resolved;
     $('manualStudent').innerHTML='<option value="">อ่านจาก QR</option>'+S.students.map(x=>`<option value="${esc(x.studentId)}">${esc(x.room)} ${esc(x.studentId)} ${esc(x.name)}</option>`).join('');
     scanStatus();
     read=omrReadFrame(cvs,S.exam);
   }else read=probe;
  }else read=omrReadFrame(cvs,S.exam);omrProcessMs=Math.round(performance.now()-started);
  if(!read){omrMissing++;if(omrMissing>=2){S.lastPaper='';omrCandidate='';omrRepeat=0;if(omrAwaitRemoval&&!omrResultOpen){omrAwaitRemoval=false;scanState('พร้อมสแกน');}}return;}
  omrMissing=0;
  if(omrAwaitRemoval){scanState('ยกกระดาษออกก่อน');return;}
  await handleOMRRead(read,false);
 }finally{S.processing=false}
}
/** Shared between phone camera and scanned-PDF input. Never silently replaces scores. */
async function handleOMRRead(read,fromPdf=false){
 if(S.autoMode&&!read.qrExam)throw Error('โหมดอัตโนมัติต้องอ่าน QR ได้ก่อน');
 if(read.qrExam && read.qrExam!==S.exam.examId)throw Error('กระดาษเป็นคนละชุดข้อสอบ');
 const matched=read.studentDigits?S.students.filter(s=>String(s.studentId).padStart(5,'0')===read.studentDigits):[];
 const studentId=read.qrStudent|| (matched.length===1?matched[0].studentId:'') || (fromPdf?'':$('manualStudent').value);
 if(read.qrStudent && matched.length===1 && matched[0].studentId!==read.qrStudent)throw Error('รหัสวงดำไม่ตรงกับ QR');
 if(!studentId)throw Error('อ่านรหัสนักเรียนไม่ได้');
 if(fromPdf && read.uncertain.length)throw Error('คำตอบไม่ชัด/ฝนหลายตัวเลือก ข้อ '+read.uncertain.join(', '));
 if(fromPdf && !read.answers.some(Boolean))throw Error('ระบบอ่านคำตอบว่างทั้งหมด ไม่บันทึกคะแนน');
 const signature=S.exam.examId+'|'+studentId+'|1|'+read.answers.join(',')+'|'+read.uncertain.join(',');
 if(!fromPdf){
  if(omrResultOpen||omrAwaitRemoval)return {status:'waiting-removal'};
  if(omrCandidate===signature)omrRepeat++;else{omrCandidate=signature;omrRepeat=1;}
  if(omrRepeat<2){scanState('อ่านภาพแล้ว กำลังยืนยันอีกเฟรม');return {status:'unstable'}};
  if(S.lastPaper===S.exam.examId+'|'+studentId+'|1')return {status:'same-paper'};
  // Do not mark the paper consumed until the teacher has confirmed the preview.
  omrReviewPending=true;
  await showOmrReview(read,studentId);
  return {status:'review'};
 }
 const result=await api('scan',{examId:S.exam.examId,studentId,pageNo:1,answers:read.answers,...(S.autoMode?{qrAuto:true,qrExam:read.qrExam,qrStudent:read.qrStudent}:{})});
 if(result.duplicate){
  if(fromPdf)return {status:'duplicate',studentId};
  omrAwaitRemoval=true;setResultLock(true);
  let didReplace=false;
  try{
   const choice=window.Swal?.fire?await Swal.fire({icon:'warning',title:'กระดาษนี้ตรวจแล้ว',html:`<strong>${esc(result.student.name)}</strong><br>${esc(result.student.room)} • คะแนนเดิม ${esc(result.previous.score)}<br><small>ต้องการตรวจซ้ำและแทนคะแนนเดิมหรือไม่?</small>`,showCancelButton:true,confirmButtonText:'ตรวจซ้ำและแทนคะแนน',cancelButtonText:'ข้ามแผ่นนี้',confirmButtonColor:'#b45309',reverseButtons:true,allowOutsideClick:false}):{isConfirmed:window.confirm('ตรวจแล้ว: '+result.student.name+' คะแนน '+result.previous.score+' ตรวจซ้ำหรือไม่?')};
   if(choice.isConfirmed){
    const replacement=await api('scan',{examId:S.exam.examId,studentId,pageNo:1,answers:read.answers,replace:true,expectedRevision:result.previous.revision,...(S.autoMode?{qrAuto:true,qrExam:read.qrExam,qrStudent:read.qrStudent}:{})});
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
/** OMR overlay: BLUE is the candidate read (in legend only), GREEN correct,
 * RED wrong, YELLOW unresolved. Scores are not saved until confirmation.
 * Image coordinates are a normalized 840x1188 image (4 px per mm).
 */
async function showOmrReview(read,studentId){
 const student=S.students.find(x=>String(x.studentId)===String(studentId));
 const choices=[...S.exam.choiceSet];
 const answers=read.answers.slice();
 const uncertain=new Set(read.uncertain);
 const layout=OMRLayout.forCount(answers.length);
 const examKey=S.exam.answerKey||[];const hasKey=examKey.length===S.exam.numQuestions;
 const overlay=document.createElement('div');
 overlay.className='omr-review-backdrop';overlay.id='omrReviewDialog';
 overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','ตรวจสอบคำตอบก่อนบันทึก');
 overlay.innerHTML=`<section class="omr-review-panel"><header><div><strong>ตรวจสอบการอ่านคำตอบ</strong><small>${esc(student?.name||studentId)} • ${esc(student?.room||'')} • ${esc(studentId)}</small></div><button type="button" class="omr-review-close" id="omrCancelReview" aria-label="ยกเลิก">✕</button></header><div class="omr-review-legend"><span class="omr-lgreen">● ${hasKey?'ตอบถูก':'อ่านคำตอบได้'}</span><span class="omr-lred">● ${hasKey?'ตอบผิด':'ยังไม่ตรวจคะแนน'}</span><span class="omr-lyellow">● ไม่ชัด / ต้องยืนยัน</span></div><div class="omr-review-image-wrap"><canvas id="omrReviewCanvas"></canvas></div><div id="omrReviewStats" class="omr-review-stats"></div><div class="omr-review-note">แตะข้อที่ต้องการเปลี่ยนคำตอบด้านล่าง • กรณีไม่ชัดต้องยืนยันคำตอบก่อนบันทึก</div><div id="omrReviewAnswers" class="omr-review-answers"></div><footer><button type="button" class="secondary" id="omrRescanReview">สแกนใหม่</button><button type="button" id="omrConfirmReview">ยืนยันและบันทึกคะแนน</button></footer></section>`;
 document.body.appendChild(overlay);setResultLock(true);
 const image=new Image();
 let closed=false;
 const close=()=>{if(closed)return;closed=true;overlay.remove();omrReviewPending=false;setResultLock(false);omrCandidate='';omrRepeat=0;scanState('พร้อมสแกน');};
 document.getElementById('omrCancelReview').onclick=close;
 document.getElementById('omrRescanReview').onclick=close;
 const canvas=overlay.querySelector('#omrReviewCanvas');const ctx=canvas.getContext('2d');
 const show=()=>{
  if(closed)return;
  canvas.width=840;canvas.height=1188;
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  for(let q=0;q<answers.length;q++){
   const answer=answers[q], key=String(examKey[q]||'');
   const choiceIndex=choices.indexOf(answer);
   const pending=uncertain.has(q+1);
   // Ring the selected choice; for unknown answer ring the whole item area in amber.
   if(choiceIndex>=0){
    const pt=layout.position(q,choiceIndex);
    ctx.beginPath();ctx.arc(pt.x*4,pt.y*4,(layout.radius+1.05)*4,0,2*Math.PI);
    ctx.lineWidth=4.2;ctx.strokeStyle=pending?'#eab308':!hasKey?'#2563eb':answer===key?'#16a34a':'#ef4444';ctx.stroke();
   }else if(pending){
    const pt=layout.position(q,0);
    ctx.strokeStyle='#eab308';ctx.lineWidth=3.5;
    ctx.strokeRect((pt.x-13)*4,(pt.y-3.7)*4,(11+choices.length*layout.choicePitch)*4,7.4*4);
   }
  }
  const correct=answers.filter((a,i)=>a&&!uncertain.has(i+1)&&a===examKey[i]).length;
  const wrong=answers.filter((a,i)=>a&&!uncertain.has(i+1)&&a!==examKey[i]).length;
  const unresolved=uncertain.size;
  overlay.querySelector('#omrReviewStats').textContent=hasKey?`ถูก ${correct} ข้อ • ผิด ${wrong} ข้อ • ไม่ชัด ${unresolved} ข้อ`:`อ่านได้ ${answers.filter(Boolean).length} ข้อ • ไม่ชัด ${unresolved} ข้อ • รอครูบันทึกเฉลย`;
  overlay.querySelector('#omrConfirmReview').disabled=unresolved>0||!answers.some(Boolean);
  const host=overlay.querySelector('#omrReviewAnswers');host.innerHTML='';
  for(let q=0;q<answers.length;q++){
   const row=document.createElement('div');row.className='omr-review-item'+(uncertain.has(q+1)?' warning':'');
   const title=document.createElement('span');title.textContent=`ข้อ ${q+1} • เฉลย ${examKey[q]||'—'}`;row.appendChild(title);
   const select=document.createElement('select');select.setAttribute('aria-label',`แก้คำตอบข้อ ${q+1}`);
   const empty=document.createElement('option');empty.value='';empty.textContent=uncertain.has(q+1)?'⚠ ยังไม่ชัด':'เว้นว่าง';select.appendChild(empty);if(uncertain.has(q+1)){const blank=document.createElement('option');blank.value='__BLANK__';blank.textContent='ยืนยันเว้นว่าง';select.appendChild(blank);}
   for(const ch of choices){const opt=document.createElement('option');opt.value=ch;opt.textContent=ch;select.appendChild(opt)}
   select.value=answers[q]||'';
   select.onchange=()=>{answers[q]=select.value==='__BLANK__'?'':select.value;uncertain.delete(q+1);show()};
   row.appendChild(select);host.appendChild(row);
  }
 };
 image.onload=show;
 image.onerror=()=>{close();ExamUI?.alert?.('ไม่สามารถเปิดภาพตรวจทาน','กรุณาสแกนใหม่','error')};
 image.src=read.previewImage;
 overlay.querySelector('#omrConfirmReview').onclick=async()=>{
  if(uncertain.size||!answers.some(Boolean))return;
  const button=overlay.querySelector('#omrConfirmReview');button.disabled=true;button.textContent='กำลังบันทึก…';
  try{
   // The whole normalized image and choices are reviewed before this server write.
   // The same duplicate/revision API contract as existing scanner.js is preserved.
   const result=await api('scan',{examId:S.exam.examId,studentId,pageNo:1,answers,...(S.autoMode?{qrAuto:true,qrExam:read.qrExam,qrStudent:read.qrStudent}:{})});
   if(result.duplicate){
    const choice=window.Swal?.fire?await Swal.fire({icon:'warning',title:'นักเรียนคนนี้ตรวจแล้ว',html:`${esc(student?.name||studentId)}<br>คะแนนเดิม ${esc(result.previous?.score)} — ต้องการแทนที่หรือไม่?`,showCancelButton:true,confirmButtonText:'ยืนยันตรวจซ้ำ',cancelButtonText:'ไม่แทนที่',allowOutsideClick:false}):{isConfirmed:window.confirm('ตรวจแล้ว ต้องการแทนคะแนนเดิมหรือไม่?')};
    if(!choice.isConfirmed){close();omrAwaitRemoval=true;return}
    const revised=await api('scan',{examId:S.exam.examId,studentId,pageNo:1,answers,replace:true,expectedRevision:result.previous.revision,...(S.autoMode?{qrAuto:true,qrExam:read.qrExam,qrStudent:read.qrStudent}:{})});
    if(!revised.complete)throw Error('เซิร์ฟเวอร์ยังไม่ยืนยันคะแนนรวม');
    close();S.lastPaper=S.exam.examId+'|'+studentId+'|1';showSaved(revised,{replacement:true});return;
   }
   if(!result.complete)throw Error('ระบบยังไม่ได้คะแนนสมบูรณ์ (PARTIAL) กรุณาตรวจ Apps Script');
   close();S.lastPaper=S.exam.examId+'|'+studentId+'|1';showSaved(result);
  }catch(e){button.disabled=false;button.textContent='ยืนยันและบันทึกคะแนน';if(window.Swal?.fire)await Swal.fire({icon:'error',title:'บันทึกไม่สำเร็จ',text:e.message||String(e)});else window.alert(e.message||String(e));}
 };
}
function showSaved(r,{replacement=false}={}){
 $('scanResult').innerHTML=`<div class="card"><div class="sub">บันทึกคะแนนสำเร็จ</div><h3>${esc(r.student.name)} — ${esc(r.student.room)}</h3><div class="score">${r.awaitingKey?'รอเฉลย (ยังไม่คิดคะแนน)':r.complete?r.score+' / '+r.fullScore:'แผ่น '+r.pageNo+'/'+r.totalPages+' = '+r.pageScore+' คะแนน'}</div><p class="sub">${r.awaitingKey?'บันทึกคำตอบครบแล้ว':'ตรวจครบทุกแผ่นแล้ว'} • รหัส ${esc(r.student.studentId)} • บันทึกครั้งที่ ${r.revision}</p></div>`;
 $('scanResult').insertAdjacentHTML('beforeend','<p><button id="viewUpdatedReport" class="secondary">ดูคะแนนและวิเคราะห์อัตโนมัติ</button></p>');$('viewUpdatedReport').onclick=()=>attempt(async()=>{await showReport();$('report').scrollIntoView({behavior:'smooth'})});
 if(!replacement)omrSavedThisSession++;scanStatus(r);showScanConfirmation(r);
 message(`บันทึกแผ่น ${r.pageNo}/${r.totalPages} ของ ${r.student.name} ${r.complete?'รวม '+r.score+'/'+r.fullScore:'รอแผ่นถัดไป'} กรุณายกกระดาษออกก่อนสแกนแผ่นใหม่`);
 try{if(window.speechSynthesis){window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(r.complete?'ตรวจครบแล้ว '+r.score+' คะแนน':'บันทึกแผ่นที่ '+r.pageNo+' แล้ว');u.lang='th-TH';u.rate=1.1;window.speechSynthesis.speak(u)}}catch(_){}
}

// Wire optional torch button; no-op on unsupported devices.
if(document.getElementById('scanTorch')){document.getElementById('scanTorch').addEventListener('click',()=>toggleOmrTorch());updateTorchUi('เปิดกล้องเพื่อตรวจสอบไฟแฟลช');}
