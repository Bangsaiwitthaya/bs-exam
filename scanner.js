'use strict';
let omrLoopId=null,omrCandidate='',omrRepeat=0,omrMissing=0;
async function startCamera(){
 if(!S.exam)throw Error('กรุณาเลือกข้อสอบ');
 if(S.exam.answerKey.length!==S.exam.numQuestions)throw Error('ต้องบันทึกเฉลยให้ครบก่อนเริ่มสแกน');
 if(!navigator.mediaDevices?.getUserMedia)throw Error('เบราว์เซอร์หรือ HTTPS ไม่รองรับกล้อง');
 if(!window.cv?.Mat||!window.jsQR)throw Error('OpenCV.js / jsQR ยังโหลดไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง');
 stopCamera();S.stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1600},height:{ideal:1200}}});
 $('video').srcObject=S.stream;await $('video').play();$('scanner').classList.remove('hidden');S.lastPaper='';omrCandidate='';omrRepeat=0;message('เปิดกล้องแล้ว วางกระดาษให้อยู่ในภาพทั้งแผ่น');ExamUI.toast('เปิดกล้องแล้ว พร้อมสแกน','info');
 const loop=async()=>{if(!S.stream)return;if($('auto').checked&&!S.processing){try{await scanFrame()}catch(e){message(e.message||String(e),true)}}if(S.stream)omrLoopId=setTimeout(loop,1100)};loop();
}
function stopCamera(){if(omrLoopId)clearTimeout(omrLoopId);omrLoopId=null;if(S.stream)S.stream.getTracks().forEach(t=>t.stop());S.stream=null;$('scanner').classList.add('hidden')}
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
 if(!S.stream||S.processing)return;
 S.processing=true;
 try{
  const video=$('video');if(video.readyState<2)return;
  const cvs=$('capture');const max=1500,scale=Math.min(1,max/video.videoWidth);cvs.width=Math.round(video.videoWidth*scale);cvs.height=Math.round(video.videoHeight*scale);
  cvs.getContext('2d',{willReadFrequently:true}).drawImage(video,0,0,cvs.width,cvs.height);
  const read=omrReadFrame(cvs,S.exam);
  if(!read){omrMissing++;if(omrMissing>=2){S.lastPaper='';omrCandidate='';omrRepeat=0;}return;}
  omrMissing=0;
  if(read.qrExam && read.qrExam!==S.exam.examId)throw Error('กระดาษเป็นคนละชุดข้อสอบ');
  const matched=read.studentDigits?S.students.filter(s=>s.studentId.padStart(5,'0')===read.studentDigits):[];
  const studentId=read.qrStudent|| (matched.length===1?matched[0].studentId:'') || $('manualStudent').value;
  const pageNo=1;
  if(read.qrStudent && matched.length===1 && matched[0].studentId!==read.qrStudent)throw Error('รหัสวงดำไม่ตรงกับ QR กรุณาตรวจสอบกระดาษ');
  if(!studentId)throw Error('ไม่ทราบรหัสนักเรียน โปรดตรวจ QR / วงดำ หรือเลือกนักเรียนด้วยตนเอง');
  if(read.uncertain.length){message('อ่านไม่ชัดหรือฝนหลายตัวเลือก ข้อ '+read.uncertain.join(', ')+' กรุณาปรับแสงหรือแก้กระดาษ',true);return;}
  const signature=studentId+'|'+pageNo+'|'+read.answers.join(',');
  if(omrCandidate===signature)omrRepeat++;else{omrCandidate=signature;omrRepeat=1}
  if(omrRepeat<2){message('อ่านได้แล้ว กำลังยืนยันภาพครั้งที่ 2');return;}
  if(S.lastPaper===studentId+'|'+pageNo)return;
  S.lastPaper=studentId+'|'+pageNo; // ห้ามตรวจแผ่นเดิมต่อเนื่องโดยไม่ยกออก
  const result=await api('scan',{examId:S.exam.examId,studentId,pageNo,answers:read.answers});
  if(result.duplicate){
    $('scanResult').innerHTML=`<div class="card"><h3>พบการตรวจซ้ำ</h3><p>${esc(result.student.name)} ${esc(result.student.room)} แผ่น ${pageNo}/${result.totalPages} คะแนนเดิมเฉพาะแผ่น ${esc(result.previous.score)} คะแนน</p><button id="replaceScan" class="warn">ตรวจซ้ำและแทนที่คะแนนเดิม</button> <button id="cancelScan" class="secondary">ยกเลิก</button></div>`;
    $('replaceScan').onclick=()=>attempt(async()=>{if(!await ExamUI.confirm('ยืนยันการตรวจซ้ำ',`แทนคะแนนเดิมของ ${result.student.name} (${result.previous.score} คะแนน) ด้วยผลสแกนใหม่?`,'ตรวจซ้ำและแทนที่'))return;const r=await api('scan',{examId:S.exam.examId,studentId,pageNo,answers:read.answers,replace:true,expectedRevision:result.previous.revision});showSaved(r)});
    $('cancelScan').onclick=()=>{$('scanResult').innerHTML='';message('ข้ามกระดาษที่ตรวจแล้ว')};
    message('พบการตรวจซ้ำ: ต้องยืนยันก่อนบันทึก');ExamUI.toast('พบกระดาษที่ตรวจแล้ว','warning');
  }else showSaved(result);
 }finally{S.processing=false}
}
function showSaved(r){
 $('scanResult').innerHTML=`<div class="card"><div class="sub">บันทึกคะแนนสำเร็จ</div><h3>${esc(r.student.name)} — ${esc(r.student.room)}</h3><div class="score">${r.complete?r.score+' / '+r.fullScore:'แผ่น '+r.pageNo+'/'+r.totalPages+' = '+r.pageScore+' คะแนน'}</div><p class="sub">${r.complete?'ตรวจครบทุกแผ่นแล้ว':'ยังรอแผ่นอื่น จึงยังไม่คิดคะแนนรวม'} • รหัส ${esc(r.student.studentId)} • บันทึกครั้งที่ ${r.revision}</p></div>`;
 $('scanResult').insertAdjacentHTML('beforeend','<p><button id="viewUpdatedReport" class="secondary">ดูคะแนนและวิเคราะห์อัตโนมัติ</button></p>');$('viewUpdatedReport').onclick=()=>attempt(async()=>{await showReport();$('report').scrollIntoView({behavior:'smooth'})});
 ExamUI.toast('บันทึกคะแนน '+r.student.name+' '+r.score+'/'+r.fullScore);message(`บันทึกแผ่น ${r.pageNo}/${r.totalPages} ของ ${r.student.name} ${r.complete?'รวม '+r.score+'/'+r.fullScore:'รอแผ่นถัดไป'} กรุณายกกระดาษออกก่อนสแกนแผ่นใหม่`);
 try{if(window.speechSynthesis){window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(r.complete?'ตรวจครบแล้ว '+r.score+' คะแนน':'บันทึกแผ่นที่ '+r.pageNo+' แล้ว');u.lang='th-TH';u.rate=1.1;window.speechSynthesis.speak(u)}}catch(_){}
}
