'use strict';
/** SVG A4 OMR. All geometry is in mm, shared with scanner.js.
 * Fiducial marker centers: (14,14),(196,14),(14,283),(196,283).
 * Bubble centers: x=34 + column*63 + choiceIndex*9.1; y=112 + row*8.25
 * 3 columns, 17 rows per column, 50 answers per OMR page.
 * Student ID: 5 columns x=48+21*d; y=57.5+3.55*digit.
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
 function omrPage(e,st,pageNo,inlineQuestions=[]){
  const s=st||{},total=Math.ceil(Number(e.numQuestions)/50),start=(pageNo-1)*50,count=Math.min(50,e.numQuestions-start),opts=[...e.choiceSet];
  const parts=[];
  for(const [x,y] of [[10,10],[192,10],[10,279],[192,279]])parts.push(rect(x,y,8,8));
  parts.push(header(e,s,'ปรนัย'));
  parts.push(`<image x="161" y="18" width="27" height="27" href="${qr(`BSOMR2|${e.examId}|${s.studentId||''}|${pageNo}`)}"/>`);
  parts.push(txt(161,49,'สแกน QR พร้อมช่องฝน',2.6));
  parts.push(txt(20,59,`แผ่นที่ ${pageNo}/${total}  |  ข้อ ${start+1}–${start+count}`,3.6,'font-weight="700"'));
  parts.push(txt(20,65,'รหัสนักเรียน 5 หลัก',3.6,'font-weight="700"'));
  const id=String(s.studentId||'').trim(),digits=/^\d{1,5}$/.test(id)?id.padStart(5,'0').split('').map(Number):null;
  for(let d=0;d<5;d++){
    const x=48+d*21;
    parts.push(rect(x-4,66,8,5,'#fff'),`<rect x="${n(x-4)}" y="66" width="8" height="5" stroke="#111" stroke-width=".26" fill="none"/>`);
    parts.push(txt(x,69.9,digits?digits[d]:'',3.3,'text-anchor="middle" font-weight="700"'));
    for(let r=0;r<10;r++)parts.push(circ(x,73+r*2.65,1.1,!!digits&&digits[d]===r));
  }
  for(let r=0;r<10;r++)parts.push(txt(34,73.8+r*2.65,r,2.35));
  parts.push(line(20,102,190,102,'.38','#444'),txt(20,99,'คำชี้แจง: ฝนคำตอบให้ทึบเต็มวงด้วยปากกาสีน้ำเงิน/ดำ หรือดินสอ',3.1));
  for(let col=0;col<3;col++){
    const xx=34+col*63;
    parts.push(txt(xx-15,107,'ข้อ',3.2,'font-weight="700"'));
    opts.forEach((ch,j)=>parts.push(txt(xx+j*9.1,107,ch,3.0,'text-anchor="middle" font-weight="700"')));
  }
  const rowsPerCol=Math.ceil(count/3);
  for(let q=0;q<count;q++){
    const col=Math.floor(q/rowsPerCol),row=q%rowsPerCol,y=112+row*8.25,x=34+col*63;
    parts.push(txt(x-15,y+1.15,start+q+1,3.3,'font-weight="700"'));
    opts.forEach((ch,j)=>parts.push(`<g class="bubble" data-question="${start+q+1}" data-choice="${esc(ch)}">${circ(x+j*9.1,y,3.18)}</g>`));
  }
  if(inlineQuestions.length){
    const essayY=Math.max(128,112+(rowsPerCol-1)*8.25+10);
    let at=essayY;
    inlineQuestions.forEach(({question,number,lines})=>{
      const content=`<div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Sarabun,sans-serif;color:#111;font-size:11pt;line-height:1.4;font-weight:600;overflow-wrap:anywhere;white-space:pre-wrap">ข้อ ${number}. ${esc(question)}</div>`;
      parts.push(`<foreignObject x="20" y="${n(at)}" width="170" height="15">${content}</foreignObject>`);
      at+=15;
      for(let r=0;r<lines;r++)parts.push(line(20,at+r*7.5,190,at+r*7.5,'.2','#666'));
      at+=lines*7.5+5;
    });
  }
  parts.push(line(20,260,190,260,'.24','#aaa'),txt(20,267,`ชุดข้อสอบ ${String(e.examId).slice(0,8)} · แผ่น ${pageNo}/${total}`,2.9),
    txt(20,272,'ห้ามตัดหรือย่อขนาดกระดาษ กรุณาพิมพ์ขนาดจริง 100%',2.75));
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="210mm" height="297mm" viewBox="0 0 210 297" role="img" aria-label="กระดาษคำตอบ OMR">${parts.join('')}</svg>`;
  return `<section class="page omr-page" data-sheet="${pageNo}" data-questions="${count}">${svg}</section>`;
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
    const total=Math.ceil(exam.numQuestions/50);
    let inlineCount=0,inlineQuestions=[];
    const questionList=exam.essayQuestions?.length?exam.essayQuestions:Array.from({length:Number(exam.essayCount)||0},(_,i)=>`คำตอบอัตนัยข้อ ${i+1}`);
    if(exam.essayMode==='same' && questionList.length){
      const count=Number(exam.numQuestions)-(total-1)*50;
      const rows=Math.ceil(count/3);
      const startY=Math.max(128,112+(rows-1)*8.25+10);
      const lines=Math.min(20,Math.max(2,Number(exam.essayLines)||8));
      let free=255-startY;
      for(const question of questionList){
        const needed=15+lines*7.5+5;
        if(free<needed)break;
        inlineQuestions.push({question,number:inlineCount+1,lines});
        inlineCount++;free-=needed;
      }
    }
    for(let i=1;i<=total;i++)pages.push(omrPage(exam,s,i,i===total?inlineQuestions:[]));
    // When there is insufficient room on OMR, continue on extra sheet without shrinking bubbles.
    pages.push(...essayPages(exam,s,inlineCount));
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
