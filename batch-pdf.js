'use strict';
window.OMRBatch=(()=>{
 let running=false;
 async function processPdf(){
  if(running)throw Error('กำลังตรวจ PDF อีกไฟล์อยู่');
  if(!S.exam)throw Error('กรุณาเลือกชุดข้อสอบก่อน');
  if(S.exam.answerKey.length!==S.exam.numQuestions)throw Error('กรุณาบันทึกเฉลยให้ครบก่อนตรวจ PDF');
  if(!window.pdfjsLib||!window.cv?.Mat||!window.jsQR)throw Error('ไลบรารี PDF/OMR ยังโหลดไม่สำเร็จ');
  const file=$('pdfFile').files[0];if(!file)throw Error('กรุณาเลือกไฟล์ PDF');
  if(file.size>40*1024*1024)throw Error('ไฟล์ใหญ่เกิน 40 MB กรุณาแบ่ง PDF');
  if(!await ExamUI.confirm('เริ่มตรวจ PDF',`ระบบจะตรวจทุกหน้าใน ${file.name} และข้ามนักเรียนที่ตรวจแล้วโดยไม่แก้คะแนนเดิม`,'ตรวจ PDF'))return;
  running=true;const out=[];let pdf=null;
  const status=$('pdfProgress');const update=(txt)=>{status.textContent=txt;message(txt)};
  try{
   pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
   const bytes=await file.arrayBuffer();pdf=await pdfjsLib.getDocument({data:new Uint8Array(bytes)}).promise;
   const canvas=document.createElement('canvas');const ctx=canvas.getContext('2d',{willReadFrequently:true});
   for(let i=1;i<=pdf.numPages;i++){
    update(`กำลังตรวจ PDF หน้า ${i}/${pdf.numPages} • บันทึกสำเร็จ ${out.filter(x=>x.status==='saved').length} หน้า`);
    try{
     const page=await pdf.getPage(i);const vp0=page.getViewport({scale:1});const scale=Math.min(3,2200/Math.max(vp0.width,vp0.height));const view=page.getViewport({scale});
     canvas.width=Math.round(view.width);canvas.height=Math.round(view.height);
     ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
     await page.render({canvasContext:ctx,viewport:view}).promise;
     const result=omrReadFrame(canvas,S.exam);
     if(!result)throw Error('ไม่พบจุดมาร์ก 4 มุม');
     const state=await handleOMRRead(result,true);out.push({page:i,...state});
    }catch(e){out.push({page:i,status:'review',reason:e.message||String(e)})}
   }
   const saved=out.filter(x=>x.status==='saved').length,duplicates=out.filter(x=>x.status==='duplicate').length,review=out.filter(x=>x.status==='review');
   const details=review.map(x=>`หน้า ${x.page}: ${x.reason}`).join('\n');
   update(`ตรวจ PDF ${pdf.numPages} หน้า\nสำเร็จ ${saved} • ตรวจซ้ำ ${duplicates} • ต้องตรวจสอบ ${review.length}`+(details?'\n'+details:''));
   await ExamUI.alert('สรุปการตรวจ PDF',`บันทึก ${saved} หน้า / ซ้ำ ${duplicates} หน้า / ต้องตรวจสอบ ${review.length} หน้า${review.length?'\n'+details.slice(0,1000):''}`,review.length?'warning':'success');
  }finally{running=false;await pdf?.destroy?.()}
 }
 return {processPdf};
})();
