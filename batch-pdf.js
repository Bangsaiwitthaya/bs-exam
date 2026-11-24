'use strict';
/* PDF review queue: only failed pages are retained in browser RAM for manual review.
 * No page image is uploaded to Google. Successful pages are saved by existing API.
 */
window.OMRBatch=(()=>{
 let running=false,issues=[],active=false;
 const el=id=>document.getElementById(id);
 const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const reason=e=>e?.message||String(e);
 const readerData=canvas=>canvas.toDataURL('image/jpeg',.88);
 function progress(text){el('pdfProgress').textContent=text}
 function renderIssues(){
  const host=el('pdfIssues');if(!host)return;
  const waiting=issues.filter(x=>x.status==='review');
  host.innerHTML=issues.length?`<div class="pdf-issue-head"><strong>หน้าที่ต้องตรวจทาน ${waiting.length} / ${issues.length}</strong><small>เก็บภาพชั่วคราวเฉพาะในหน้านี้ ปิด/โหลดเว็บใหม่แล้วต้องเปิด PDF อีกครั้ง</small></div>${issues.map(x=>`<div class="pdf-issue-row"><span>หน้า ${x.page}<small>${safe(x.reason||'ตรวจสอบแล้ว')}</small></span><span class="pdf-state ${x.status}">${x.status==='saved'?'บันทึกสำเร็จ':x.status==='duplicate'?'ตรวจซ้ำ':x.status==='skipped'?'ข้าม':'รอตรวจทาน'}</span>${x.status==='review'?`<button type="button" data-review="${x.page}">ตรวจทานหน้านี้</button>`:''}</div>`).join('')}`:'';
  host.querySelectorAll('[data-review]').forEach(b=>b.onclick=()=>openReview(Number(b.dataset.review)).catch(e=>ExamUI.alert('เปิดภาพตรวจทานไม่สำเร็จ',reason(e),'error')));
 }
 async function processPdf(){
  if(running||active)throw Error('กำลังตรวจ PDF หรือมีหน้าตรวจทานเปิดอยู่');
  if(!S.exam)throw Error('กรุณาเลือกชุดข้อสอบก่อน');
  if(S.exam.answerKey.length!==S.exam.numQuestions)throw Error('กรุณาบันทึกเฉลยให้ครบก่อนตรวจ PDF');
  const h=await api('health');
  if(h?.release!=='4.4-singlepage'||h?.onePage!==true||Number(h?.pageSize)!==100)throw Error('Apps Script API ไม่รองรับกระดาษแผ่นเดียว 1–100 ข้อ กรุณาตรวจเวอร์ชันก่อน');
  if(!window.pdfjsLib||!window.cv?.Mat||!window.jsQR)throw Error('PDF.js, OpenCV.js หรือ jsQR ยังไม่พร้อม');
  const file=el('pdfFile').files[0];if(!file)throw Error('กรุณาเลือกไฟล์ PDF');
  if(file.size>40*1024*1024)throw Error('ไฟล์เกิน 40 MB กรุณาแบ่งไฟล์');
  if(!await ExamUI.confirm('ตรวจ PDF',`ตรวจทุกหน้าของ ${file.name} โดยข้ามผู้ที่ตรวจแล้ว และเปิดให้แก้เฉพาะหน้าที่ผิดพลาด`,`เริ่มตรวจ`))return;
  running=true;issues=[];renderIssues();let pdf;
  const totals={saved:0,duplicate:0,review:0};
  try{
   pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
   pdf=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
   const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
   for(let i=1;i<=pdf.numPages;i++){
    progress(`กำลังอ่านหน้า ${i}/${pdf.numPages} • บันทึกแล้ว ${totals.saved}`);
    let item={page:i,status:'review',reason:'ไม่สามารถอ่านภาพได้',image:''};
    try{
     const page=await pdf.getPage(i),base=page.getViewport({scale:1});
     const scale=Math.min(3,2200/Math.max(base.width,base.height)),view=page.getViewport({scale});
     canvas.width=Math.round(view.width);canvas.height=Math.round(view.height);
     ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
     await page.render({canvasContext:ctx,viewport:view}).promise;
     const read=omrReadFrame(canvas,S.exam);
     if(!read)throw Error('ไม่พบจุดมาร์กครบ 4 มุม — กดตรวจทานเพื่อปรับตำแหน่ง');
     item.read=read;
     if(read.uncertain.length)throw Error('คำตอบไม่ชัด/ฝนหลายตัวเลือก ข้อ '+read.uncertain.join(', '));
     if(!read.answers.some(Boolean))throw Error('อ่านคำตอบว่างทั้งหมด');
     const state=await handleOMRRead(read,true);
     if(state.status==='saved'||state.status==='duplicate'){
      item.status=state.status;item.reason=state.status==='saved'?`คะแนน ${state.score}`:'รายการนี้ตรวจแล้ว';
      totals[state.status]++;
     }else throw Error('ระบบยังไม่ยืนยันการบันทึก');
    }catch(e){item.reason=reason(e);item.status='review';totals.review++;}
    if(item.status==='review'){item.image=readerData(canvas);} // save only failed pages in memory
    issues.push(item);
    renderIssues();
   }
   progress(`ตรวจ PDF ${pdf.numPages} หน้า • บันทึก ${totals.saved} • ซ้ำ ${totals.duplicate} • รอตรวจทาน ${totals.review}`);
   await ExamUI.alert('ตรวจไฟล์ PDF เสร็จแล้ว',`บันทึก ${totals.saved} หน้า / ตรวจซ้ำ ${totals.duplicate} หน้า / รอตรวจทาน ${totals.review} หน้า${totals.review?'\nเลื่อนลงเพื่อเลือกแก้เฉพาะหน้าที่มีปัญหา':''}`,totals.review?'warning':'success');
  }finally{running=false;await pdf?.destroy?.();renderIssues()}
 }
 function imageCanvas(data){return new Promise((resolve,reject)=>{
  const img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;canvas.getContext('2d',{willReadFrequently:true}).drawImage(img,0,0);resolve(canvas)};
  img.onerror=()=>reject(Error('ไม่สามารถโหลดภาพหน้าที่มีปัญหา'));img.src=data;
 })}
 async function openReview(page){
  if(running||active)return;
  const item=issues.find(x=>x.page===page);if(!item||item.status!=='review')return;
  if(!item.image)throw Error('ไม่มีภาพหน้านี้ในหน่วยความจำ กรุณาเลือก PDF ใหม่');
  active=true;
  const overlay=document.createElement('div');overlay.className='pdf-review-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
  overlay.innerHTML=`<div class="pdf-review-panel"><header><strong>ตรวจทาน PDF หน้า ${page}</strong><button type="button" id="pdfClose" class="secondary">ปิด</button></header>
  <p class="pdf-review-warning">${safe(item.reason)}</p>
  <div class="pdf-review-grid"><div><div class="pdf-review-img"><canvas id="pdfRepairCanvas"></canvas><div id="pdfMarkHandles"></div></div><small id="pdfCornerHelp">ถ้าหาจุดมาร์กไม่ครบ ให้ลากจุดสีส้มทั้ง 4 จุดให้ตรงกึ่งกลางสี่เหลี่ยมดำ แล้วกดอ่านใหม่</small></div>
  <div class="pdf-review-controls"><button type="button" id="pdfTryAgain" class="secondary">อ่านอัตโนมัติอีกครั้ง</button><button type="button" id="pdfUseCorners" class="secondary">อ่านด้วยจุดมุมที่ปรับ</button><button type="button" id="pdfEditCorners" class="secondary">แสดงภาพต้นฉบับเพื่อปรับมุม</button>
  <label>นักเรียน<select id="pdfStudent"><option value="">-- เลือกนักเรียน --</option></select></label>
  <div id="pdfRepairStatus" role="status"></div><div id="pdfChoices"></div>
  <button type="button" id="pdfSaveCorrection">ยืนยันและบันทึกคะแนนหน้านี้</button><button type="button" id="pdfSkip" class="secondary">ข้ามไว้ตรวจทีหลัง</button></div></div></div>`;
  document.body.appendChild(overlay);
  let base=await imageCanvas(item.image),read=item.read||null,answers=read?read.answers.slice():Array(Number(S.exam.numQuestions)).fill(''),uncertain=new Set(read?.uncertain||[]),normalized=null;
  const choices=[...S.exam.choiceSet],key=S.exam.answerKey;
  const stage=overlay.querySelector('#pdfRepairCanvas'),ctx=stage.getContext('2d');
  stage.width=base.width;stage.height=base.height;
  const pts=[{x:.055,y:.05},{x:.945,y:.05},{x:.945,y:.95},{x:.055,y:.95}];
  function display(){
   if(read&&normalized){
    stage.width=840;stage.height=1188;ctx.drawImage(normalized,0,0,840,1188);
    const layout=OMRLayout.forCount(answers.length);
    answers.forEach((a,i)=>{
     const j=choices.indexOf(a);if(j<0)return;
     const pt=layout.position(i,j);ctx.beginPath();ctx.arc(pt.x*4,pt.y*4,(layout.radius+1.1)*4,0,2*Math.PI);
     ctx.lineWidth=4.1;ctx.strokeStyle=uncertain.has(i+1)?'#eab308':a===key[i]?'#16a34a':'#dc2626';ctx.stroke();
    });
    uncertain.forEach(q=>{if(answers[q-1])return;const pt=layout.position(q-1,0);ctx.strokeStyle='#eab308';ctx.lineWidth=3.5;ctx.strokeRect((pt.x-13)*4,(pt.y-4)*4,(12+choices.length*layout.choicePitch)*4,8*4)});
    overlay.querySelector('#pdfMarkHandles').style.display='none';
   }else{
    stage.width=base.width;stage.height=base.height;ctx.drawImage(base,0,0);
    ctx.strokeStyle='#f59e0b';ctx.lineWidth=Math.max(3,stage.width*.004);ctx.beginPath();pts.forEach((p,i)=>{const x=p.x*stage.width,y=p.y*stage.height;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.closePath();ctx.stroke();
    overlay.querySelector('#pdfMarkHandles').style.display='block';
   }
  }
  function drawHandles(){const host=overlay.querySelector('#pdfMarkHandles');host.innerHTML='';pts.forEach((p,i)=>{
   const h=document.createElement('button');h.type='button';h.className='pdf-corner-handle';h.textContent=String(i+1);h.setAttribute('aria-label',`มุม ${i+1}`);h.style.left=(p.x*100)+'%';h.style.top=(p.y*100)+'%';
   h.onpointerdown=e=>{e.preventDefault();h.setPointerCapture(e.pointerId)};
   h.onpointermove=e=>{if(!h.hasPointerCapture(e.pointerId))return;const rect=stage.getBoundingClientRect();p.x=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));p.y=Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height));h.style.left=p.x*100+'%';h.style.top=p.y*100+'%';display()};host.appendChild(h)
  })}
  function form(){
   const host=overlay.querySelector('#pdfChoices');host.innerHTML='';
   if(!read){host.textContent='ยังระบุตำแหน่งวงคำตอบไม่ได้ กรุณาอ่านภาพอีกครั้งก่อน';return}
   for(let i=0;i<answers.length;i++){
    const line=document.createElement('label');line.className='pdf-answer-row';if(uncertain.has(i+1))line.classList.add('uncertain');
    const title=document.createElement('span');title.textContent=`ข้อ ${i+1} • เฉลย ${key[i]||'–'}`;line.appendChild(title);
    const sel=document.createElement('select');sel.innerHTML=`<option value="">${uncertain.has(i+1)?'⚠ อ่านไม่ชัด':'เว้นว่าง'}</option>${uncertain.has(i+1)?'<option value="__BLANK__">ยืนยันเว้นว่าง</option>':''}${choices.map(c=>`<option value="${safe(c)}">${safe(c)}</option>`).join('')}`;sel.value=answers[i]||'';
    sel.onchange=()=>{answers[i]=sel.value==='__BLANK__'?'':sel.value;uncertain.delete(i+1);line.classList.remove('uncertain');updateScore();display()};line.appendChild(sel);host.appendChild(line)
   }updateScore()
  }
  function updateScore(){const correct=answers.filter((a,i)=>a&&a===key[i]).length;
   overlay.querySelector('#pdfRepairStatus').textContent=`อ่านแล้ว ${answers.filter(Boolean).length}/${answers.length} ข้อ • คะแนนที่คาด ${correct}/${answers.length} • ข้อรอยืนยัน ${uncertain.size}`;
   overlay.querySelector('#pdfSaveCorrection').disabled=!read||uncertain.size>0||!answers.some(Boolean)}
  const studentSel=overlay.querySelector('#pdfStudent');
  S.students.forEach(s=>{const o=document.createElement('option');o.value=s.studentId;o.textContent=`${s.room} ${s.studentId} ${s.name}`;studentSel.appendChild(o)});
  function chooseId(){const x=read?.qrStudent||read?.studentDigits||'';const match=S.students.find(s=>String(s.studentId).padStart(5,'0')===String(x).padStart(5,'0'));studentSel.value=match?.studentId||''}
  function setRead(r){read=r;answers=r.answers.slice();uncertain=new Set(r.uncertain);item.read=r;item.reason='อ่านภาพแล้ว กรุณาตรวจทานคำตอบ';overlay.querySelector('.pdf-review-warning').textContent=item.reason;
   overlay.querySelector('#pdfRepairStatus').textContent='อ่านภาพสำเร็จ';chooseId();
   normalized=null;const im=new Image();im.onload=()=>{normalized=im;display()};im.src=r.previewImage;
   form();display()}
  const close=()=>{overlay.remove();active=false;renderIssues()};overlay.querySelector('#pdfClose').onclick=close;overlay.querySelector('#pdfSkip').onclick=close;
  async function retry(manual){try{
   if(!manual){normalized=null;const r=omrReadFrame(base,S.exam);if(!r)throw Error('ยังหาจุดมาร์กไม่ครบ ให้ลากจุด 1–4 แล้วกดอ่านด้วยจุดมุมที่ปรับ');setRead(r)}
   else{normalized=null;const p=pts.map(v=>({x:v.x*base.width,y:v.y*base.height}));const r=omrReadFrame(base,S.exam,p);if(!r)throw Error('ไม่สามารถอ่านด้วยจุดที่เลือก');setRead(r)}
  }catch(e){read=null;normalized=null;overlay.querySelector('#pdfRepairStatus').textContent=reason(e);display();form()}}
  overlay.querySelector('#pdfTryAgain').onclick=()=>retry(false);
  overlay.querySelector('#pdfUseCorners').onclick=()=>retry(true);
  overlay.querySelector('#pdfEditCorners').onclick=()=>{read=null;normalized=null;uncertain.clear();display();overlay.querySelector('#pdfRepairStatus').textContent='ลากจุดสีส้มบนภาพต้นฉบับ แล้วกดอ่านด้วยจุดมุมที่ปรับ';form()};
  overlay.querySelector('#pdfSaveCorrection').onclick=async()=>{
   if(!read||uncertain.size)throw Error('โปรดแก้ไขข้อที่อ่านไม่ชัดให้ครบก่อน');
   const studentId=studentSel.value;if(!studentId){await ExamUI.alert('ต้องเลือกนักเรียน','กรุณาเลือกนักเรียนที่ตรงกับกระดาษ','warning');return}
   const who=S.students.find(s=>String(s.studentId)===String(studentId));
   if(!await ExamUI.confirm('ยืนยันข้อมูลและคะแนน',`${who?.name||studentId} (${who?.room||''})\nคะแนน ${answers.filter((a,i)=>a===key[i]).length}/${answers.length}\nจะบันทึกเฉพาะหน้า PDF ${page}`, 'บันทึกคะแนน'))return;
   const button=overlay.querySelector('#pdfSaveCorrection');button.disabled=true;
   try{
    let result=await api('scan',{examId:S.exam.examId,studentId,pageNo:1,answers});
    if(result.duplicate){
     if(!await ExamUI.confirm('มีผลตรวจอยู่แล้ว',`นักเรียน ${who?.name||studentId} มีคะแนนเดิม ${result.previous?.score} ต้องการตรวจซ้ำและแทนที่หรือไม่`,'ตรวจซ้ำ')){button.disabled=false;return}
     result=await api('scan',{examId:S.exam.examId,studentId,pageNo:1,answers,replace:true,expectedRevision:result.previous.revision});
    }
    if(!result.complete)throw Error('API ยังไม่ยืนยันคะแนนรวม ไม่บันทึกเป็นผลสำเร็จ');
    item.status='saved';item.reason=`${who?.name||studentId} • ${result.score}/${result.fullScore}`;delete item.image;delete item.read;
    progress(`แก้ไข PDF หน้า ${page} สำเร็จ • ${item.reason}`);close();await ExamUI.alert('บันทึกคะแนนสำเร็จ',item.reason,'success');
   }catch(e){button.disabled=false;await ExamUI.alert('บันทึกไม่สำเร็จ',reason(e),'error')}
  };
  display();drawHandles();chooseId();form();if(read){const im=new Image();im.onload=()=>{normalized=im;display()};im.src=read.previewImage;}
 }
 return {processPdf,openReview};
})();
