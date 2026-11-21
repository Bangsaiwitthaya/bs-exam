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
  const name=s.name||'..............................................................';
  return [
   txt(20,23,'โรงเรียนบางไทรวิทยา',5.4,'font-weight="700"'),
   txt(20,30,'กระดาษคำตอบ'+subtitle+' · '+e.examType,4.0,'font-weight="700"'),
   txt(20,36,`${e.subjectName} (${e.subjectCode}) · ภาคเรียน ${e.semester}/${e.academicYear}`,3.2),
   line(20,39,155,39,'.4','#444'),
   txt(20,45,`ชื่อ–สกุล ${name}`,3.55),
   txt(20,51,`ชั้น ${s.room||'...............'}     รหัสนักเรียน ${s.studentId||'................'}`,3.4)
  ].join('');
 }
 function omrPage(e,st){
  const s=st||{},count=Number(e.numQuestions),opts=[...e.choiceSet];
  const layout=OMRLayout.forCount(count),idLayout=OMRLayout.student,parts=[];
  for(const [x,y] of [[10,10],[192,10],[10,279],[192,279]])parts.push(rect(x,y,8,8));
  parts.push(header(e,s,'ปรนัย'));
  parts.push(`<image x="161" y="18" width="27" height="27" href="${qr(`BSOMR2|${e.examId}|${s.studentId||''}|1`)}"/>`);
  parts.push(txt(161,49,'QR ระบุชุดสอบและนักเรียน',2.5));
  parts.push(txt(20,55,'รหัสนักเรียน 5 หลัก · ระบบฝนให้ในแบบรายบุคคล',3.25,'font-weight="700"'));
  const id=String(s.studentId||'').trim(),digits=/^\d{1,5}$/.test(id)?id.padStart(5,'0').split('').map(Number):null;
  for(let d=0;d<5;d++){
    const x=idLayout.x0+d*idLayout.dx;
    parts.push(rect(x-4.5,56.5,9,5,'#fff'),`<rect x="${n(x-4.5)}" y="56.5" width="9" height="5" stroke="#111" stroke-width=".3" fill="none"/>`);
    parts.push(txt(x,60.2,digits?digits[d]:'',3.45,'text-anchor="middle" font-weight="700"'));
    for(let r=0;r<10;r++)parts.push(circ(x,idLayout.y0+r*idLayout.dy,idLayout.r,!!digits&&digits[d]===r));
  }
  for(let r=0;r<10;r++)parts.push(txt(23,61+r*idLayout.dy,r,2.8));
  parts.push(txt(20,96,'ฝนทึบเต็มวงด้วยดินสอ หรือปากกาสีน้ำเงิน/ดำ',3.25),line(20,98,191,98,'.4','#333'));
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
  return `<section class="page omr-page" data-sheet="1" data-questions="${count}">${svg}</section>`;
 }
 function essayPages(e,s,skip=0){
  const questions=(e.essayQuestions?.length?e.essayQuestions:Array.from({length:Number(e.essayCount)||0},(_,i)=>`คำตอบอัตนัยข้อ ${i+1}`)).slice(skip).map(x=>String(x||''));
  if(e.essayMode==='none'||questions.length===0)return [];
  const maxLines=Math.min(20,Math.max(2,Number(e.essayLines)||8));
  // Each printed question has room for response; text is real HTML and wraps in Sarabun.
  // At most 2 short-answer blocks/page, but long responses use one/page.
  const perPage=maxLines<=7?2:1,pages=[];
  for(let i=0;i<questions.length;i+=perPage){
    const blocks=questions.slice(i,i+perPage).map((question,j)=>`<div class="essay-block"><div class="essay-question">ข้อ ${i+j+1+skip}. ${esc(question)}</div><div class="essay-lines">${Array.from({length:maxLines},()=>'<div class="answer-line"></div>').join('')}</div></div>`).join('');
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
    pages.push(omrPage(exam,s));
    // อัตนัยแยกหน้าจาก OMR เพื่อคงแม่แบบ 100 ข้อต่อหนึ่งแผ่นและรักษาความแม่นยำ
    pages.push(...essayPages(exam,s,0));
  });
  const css=`@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap');
 @page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#111;font-family:'Sarabun',sans-serif} .page{width:210mm;height:297mm;overflow:hidden;position:relative;break-after:page;page-break-after:always;background:#fff} .page:last-child{break-after:auto;page-break-after:auto} .omr-page svg{display:block;width:210mm;height:297mm} .essay-page{padding:18mm 19mm 16mm} .essay-head{line-height:1.7;border-bottom:1px solid #222;padding-bottom:4mm;font-size:11pt}.essay-head strong{font-size:16pt}.essay-instruction{font-weight:700;font-size:11pt;margin:6mm 0}.essay-block{margin:7mm 0}.essay-question{font-size:12pt;font-weight:600;line-height:1.6;overflow-wrap:anywhere;white-space:pre-wrap}.essay-lines{margin-top:3mm}.answer-line{height:8mm;border-bottom:.23mm solid #777}.essay-foot{position:absolute;bottom:14mm;font-size:9pt;right:19mm;color:#555}@media screen{body{background:#e9edf3}.page{margin:12px auto;box-shadow:0 3px 15px #8888}}`;
  w.document.open();w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>กระดาษคำตอบ ${esc(exam.subjectCode)}</title><style>${css}</style></head><body>${pages.join('')}</body></html>`);w.document.close();
  // Allow the web font to load before print dialog. Printed SVG uses real black fills,
  // so calibration squares, bubbles, and letters do not need "Print backgrounds".
  Promise.race([w.document.fonts?.ready||Promise.resolve(),new Promise(res=>setTimeout(res,2200))]).then(()=>{try{if(!w.closed){w.focus();w.print()}}catch(_){}});
 }
 return {print};
})();
