'use strict';
/** SVG A4 OMR. All geometry is in mm, shared with scanner.js.
 * Fiducial marker centers: (14,14),(196,14),(14,283),(196,283).
 * Bubble layout, ID grid and marker coordinates are defined in omr-layout.js.
 * 1–100 answers on a single A4 page.
 */
const OMRPrint=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const n=x=>Number(x).toFixed(2);
 const rect=(x,y,w,h,fill='#000')=>`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"/>`;
 const line=(x1,y1,x2,y2,width='.28',color='#333')=>`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${color}" stroke-width="${width}"/>`;
 const circ=(x,y,r,filled=false)=>`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${filled?'#000':'#fff'}" stroke="#161616" stroke-width=".34"/>`;
 const txt=(x,y,v,sz=3.4,opts='')=>`<text x="${n(x)}" y="${n(y)}" font-family="Sarabun, sans-serif" font-size="${sz}" fill="#111" ${opts}>${esc(v)}</text>`;
 function qr(value){
   const holder=document.createElement('div');holder.style.cssText='position:fixed;left:-10000px;top:0';document.body.appendChild(holder);
   try{new QRCode(holder,{text:value,width:240,height:240,correctLevel:QRCode.CorrectLevel.M});
     const canvas=holder.querySelector('canvas');const img=canvas?canvas.toDataURL('image/png'):holder.querySelector('img')?.src;
     if(!img)throw Error('สร้าง QR ไม่สำเร็จ');return img;
   }finally{holder.remove()}
 }
 function header(e,s,subtitle){
  const name=s.name||'..............................................';
  const blank=!s.studentId;
  const parts=[
   txt(20,23,'โรงเรียนบางไทรวิทยา',5.4,'font-weight="700"'),
   txt(20,30,'กระดาษคำตอบ'+subtitle+' · '+e.examType,3.9,'font-weight="700"'),
   txt(20,36,`${e.subjectName} (${e.subjectCode}) · ${e.semester}/${e.academicYear}`,3.0),
   txt(20,43,`ชื่อ–สกุล ${name}`,3.5),
   txt(20,49,`ชั้น ${s.room||'......................'}`,3.4),
   txt(20,55,`เลขประจำตัว ${s.studentId||'................'}`,3.45,'font-weight="600"'),
   line(123,20,123,92,'.35','#999'),
   txt(130,29,'รหัสนักเรียน 5 หลัก',3.8,'font-weight="700"'),
   txt(130,34,blank?'ฝนตัวเลขให้ครบทุกหลัก':'',2.7),
  ];
  return parts.join('');
 }
 function omrPage(e,st,essayOverlay=''){
  const s=st||{},count=Number(e.numQuestions),opts=[...e.choiceSet];
  const layout=OMRLayout.forCount(count),idLayout=OMRLayout.student,parts=[];
  for(const [x,y] of [[10,10],[192,10],[10,279],[192,279]])parts.push(rect(x,y,8,8));
  parts.push(header(e,s,'ปรนัย'));
  parts.push(`<image x="20" y="59" width="29" height="29" href="${qr(`BSOMR2|${e.examId}|${s.studentId||''}|1`)}"/>`);
  parts.push(txt(52,66,'QR ชุดข้อสอบและนักเรียน',3.0),txt(52,73,'สแกนพร้อมช่องคำตอบ',2.8),txt(52,80,'ไม่ต้องสแกน QR แยก',2.7));
  
  const id=String(s.studentId||'').trim(),digits=/^\d{1,5}$/.test(id)?id.padStart(5,'0').split('').map(Number):null;
  for(let d=0;d<5;d++){
    const x=idLayout.x0+d*idLayout.dx;
    parts.push(rect(x-4.8,38,9.6,5.5,'#fff'),`<rect x="${n(x-4.8)}" y="38" width="9.6" height="5.5" stroke="#111" stroke-width=".3" fill="none"/>`);
    parts.push(txt(x,42,digits?digits[d]:'',3.65,'text-anchor="middle" font-weight="700"'));
    for(let r=0;r<10;r++)parts.push(circ(x,idLayout.y0+r*idLayout.dy,idLayout.r,!!digits&&digits[d]===r));
  }
  for(let r=0;r<10;r++)parts.push(txt(129,48+r*idLayout.dy,r,2.9));
  parts.push(txt(20,95,'ระบายคำตอบให้เต็มวงด้วยดินสอ หรือปากกาสีน้ำเงิน/ดำ',3.2),line(20,98,191,98,'.4','#333'));
  for(let col=0;col<layout.columns;col++){
    const base=layout.baseXs[col];
    parts.push(txt(base-12.0,102,'ข้อ',3.0,'font-weight="700"'));
    opts.forEach((ch,j)=>parts.push(txt(base+j*layout.choicePitch,102,ch,3.15,'text-anchor="middle" font-weight="700"')));
  }
  for(let q=0;q<count;q++){
    const pos=layout.position(q,0);
    parts.push(txt(pos.x-12,pos.y+1.10,q+1,3.0,'font-weight="700"'));
    opts.forEach((ch,j)=>{
      const point=layout.position(q,j);
      parts.push(`<g class="bubble" data-question="${q+1}" data-choice="${esc(ch)}">${circ(point.x,point.y,layout.radius)}</g>`);
    });
  }
  parts.push(line(20,266,190,266,'.24','#aaa'),txt(20,272,`ชุดข้อสอบ ${String(e.examId).slice(0,8)} · 1/1 · ${count} ข้อ`,2.9),
    txt(20,275.5,'พิมพ์ขนาดจริง 100% ห้ามย่อหน้า/ปรับ Fit to page',2.65));
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="210mm" height="297mm" viewBox="0 0 210 297" role="img" aria-label="กระดาษคำตอบ OMR">${parts.join('')}</svg>`;
  return `<section class="page omr-page" data-sheet="1" data-questions="${count}">${svg}${essayOverlay}</section>`;
 }
 function essayBlock(e,question,index,lines){
   const image=e.essayImages?.[index];
   return `<div class="essay-block"><div class="essay-question">ข้อ ${index+1}. ${esc(question)}</div>${image?`<img class="essay-image" src="${image}" alt="ภาพประกอบโจทย์">`:''}<div class="essay-lines">${Array.from({length:lines},()=>'<div class="answer-line"></div>').join('')}</div></div>`;
 }
 function inlineEssay(e){
  if(e.essayMode!=='same'||!e.essayQuestions?.length)return {html:'',skip:0};
  const layout=OMRLayout.forCount(Number(e.numQuestions));
  const top=Math.max(111+layout.pitch*(layout.rows-1)+12,114);
  const available=264-top;
  if(available<23)return {html:'',skip:0};
  let html='',used=0,skip=0;
  const lines=Math.min(20,Math.max(2,Number(e.essayLines)||8));
  for(let i=0;i<e.essayQuestions.length;i++){
   const q=e.essayQuestions[i];
   // conservative space estimate, never overlap OMR; long text/images move to essay page
   const image=e.essayImages?.[i];const questionHeight=6*Math.max(1,Math.ceil(String(q).length/95));
   const need=questionHeight+Math.min(lines,6)*7+(image?37:0)+9;
   if(used+need>available)break;
   html+=essayBlock(e,q,i,Math.min(lines,6));used+=need;skip++;
  }
  return {html:html?`<div class="omr-inline-essay" style="top:${top}mm"><strong>ตอนที่ 2 ข้อสอบอัตนัย</strong>${html}</div>`:'',skip};
 }
 function essayPages(e,s,skip=0){
  const questions=(e.essayQuestions?.length?e.essayQuestions:Array.from({length:Number(e.essayCount)||0},(_,i)=>`คำตอบอัตนัยข้อ ${i+1}`)).slice(skip).map(x=>String(x||''));
  if(e.essayMode==='none'||questions.length===0)return [];
  const maxLines=Math.min(20,Math.max(2,Number(e.essayLines)||8));
  // Each printed question has room for response; text is real HTML and wraps in Sarabun.
  // At most 2 short-answer blocks/page, but long responses use one/page.
  const perPage=maxLines<=7?2:1,pages=[];
  for(let i=0;i<questions.length;i+=perPage){
    const blocks=questions.slice(i,i+perPage).map((question,j)=>essayBlock(e,question,i+j+skip,maxLines)).join('');
    pages.push(`<section class="page essay-page"><div class="essay-head"><strong>โรงเรียนบางไทรวิทยา — กระดาษคำตอบอัตนัย</strong><div>${esc(e.subjectName)} (${esc(e.subjectCode)}) · ${esc(e.examType)} · ${esc(e.semester)}/${esc(e.academicYear)}</div><div>ชื่อ–สกุล ${esc(s.name||'...........................................')} · ชั้น ${esc(s.room||'........')} · รหัส ${esc(s.studentId||'........')}</div></div><p class="essay-instruction">ตอนที่ 2 ข้อสอบอัตนัย — ครูตรวจด้วยตนเอง ไม่บันทึกคะแนนในระบบ</p>${blocks}<div class="essay-foot">ชุดข้อสอบ ${esc(String(e.examId).slice(0,8))} · หน้าอัตนัย ${Math.floor(i/perPage)+1}</div></section>`);
  }
  return pages;
 }
 function print(exam,students){
  if(!exam||!Number.isInteger(Number(exam.numQuestions))||Number(exam.numQuestions)<1||Number(exam.numQuestions)>100)throw Error('ข้อสอบต้องมี 1–100 ข้อ');
  if(!window.QRCode)throw Error('ยังโหลดไลบรารี QR Code ไม่สำเร็จ');
  const w=window.open('','_blank');if(!w)throw Error('กรุณาอนุญาต Pop-up ของเบราว์เซอร์');
  const pages=[];
  students.forEach(st=>{
    const s=st||{};
    const inline=inlineEssay(exam);pages.push(omrPage(exam,s,inline.html));
    pages.push(...essayPages(exam,s,exam.essayMode==='same'?inline.skip:0));
  });
  const css=`@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap');
 @page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#111;font-family:'Sarabun',sans-serif} .page{width:210mm;height:297mm;overflow:hidden;position:relative;break-after:page;page-break-after:always;background:#fff} .page:last-child{break-after:auto;page-break-after:auto} .omr-page svg{display:block;width:210mm;height:297mm} .essay-page{padding:18mm 19mm 16mm} .essay-head{line-height:1.7;border-bottom:1px solid #222;padding-bottom:4mm;font-size:11pt}.essay-head strong{font-size:16pt}.essay-instruction{font-weight:700;font-size:11pt;margin:6mm 0}.essay-block{margin:7mm 0}.essay-question{font-size:12pt;font-weight:600;line-height:1.6;overflow-wrap:anywhere;white-space:pre-wrap}.essay-lines{margin-top:3mm}.answer-line{height:8mm;border-bottom:.23mm solid #777}.essay-image{display:block;max-width:100%;max-height:34mm;object-fit:contain;margin:2mm auto}.omr-inline-essay{position:absolute;left:20mm;width:170mm;font-size:9pt;line-height:1.25}.omr-inline-essay .essay-block{margin:2mm 0}.omr-inline-essay .essay-question{font-size:9pt}.omr-inline-essay .answer-line{height:6.2mm}.essay-foot{position:absolute;bottom:14mm;font-size:9pt;right:19mm;color:#555}@media screen{body{background:#e9edf3}.page{margin:12px auto;box-shadow:0 3px 15px #8888}}`;
  w.document.open();w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>กระดาษคำตอบ ${esc(exam.subjectCode)}</title><style>${css}</style></head><body>${pages.join('')}</body></html>`);w.document.close();
  // Allow the web font to load before print dialog. Printed SVG uses real black fills,
  // so calibration squares, bubbles, and letters do not need "Print backgrounds".
  Promise.race([w.document.fonts?.ready||Promise.resolve(),new Promise(res=>setTimeout(res,2200))]).then(()=>{try{if(!w.closed){w.focus();w.print()}}catch(_){}});
 }
 async function pngBlank(exam){
  if(!window.QRCode)throw Error('ยังโหลด QR Code ไม่สำเร็จ');
  const html=omrPage(exam,{},'');const host=document.createElement('div');host.innerHTML=html;
  const svg=host.querySelector('svg');if(!svg)throw Error('สร้างภาพไม่สำเร็จ');
  const serialized=new XMLSerializer().serializeToString(svg);
  const blob=new Blob([serialized],{type:'image/svg+xml;charset=utf-8'});const url=URL.createObjectURL(blob);
  try{
   const image=new Image();await new Promise((ok,fail)=>{image.onload=ok;image.onerror=()=>fail(Error('แปลงกระดาษคำตอบเป็นรูปภาพไม่สำเร็จ'));image.src=url});
   // A4 at 300 DPI; PNG for insertion into Word
   const canvas=document.createElement('canvas');canvas.width=2480;canvas.height=3508;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
   const png=await new Promise(ok=>canvas.toBlob(ok,'image/png'));if(!png)throw Error('บันทึก PNG ไม่สำเร็จ');
   const a=document.createElement('a');a.href=URL.createObjectURL(png);a.download='OMR-blank-'+exam.subjectCode+'-'+exam.numQuestions+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }finally{URL.revokeObjectURL(url)}
 }
 return {print,pngBlank};
})();
