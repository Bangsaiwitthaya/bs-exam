'use strict';
/* BS OMR V2 geometry in millimeters, shared verbatim with scanner.js: marker centers (14,14),(196,14),(14,283),(196,283); 50 answers per OMR page. */
const OMRPrint=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const mm=n=>`${n}mm`;
 function qr(value){
  const holder=document.createElement('div');holder.style.cssText='position:fixed;left:-10000px;top:0';document.body.appendChild(holder);
  new QRCode(holder,{text:value,width:220,height:220,correctLevel:QRCode.CorrectLevel.M});
  const canvas=holder.querySelector('canvas');const img=canvas?canvas.toDataURL('image/png'):holder.querySelector('img')?.src;
  holder.remove();if(!img)throw Error('สร้าง QR Code ไม่สำเร็จ');return img;
 }
 function heading(e,s,label){return `<div class="school">โรงเรียนบางไทรวิทยา</div><div class="heading">กระดาษคำตอบ${label} ${esc(e.examType)} • ${esc(e.subjectName)} (${esc(e.subjectCode)})</div><div class="detail">ปีการศึกษา ${esc(e.academicYear)} ภาคเรียน ${esc(e.semester)} | ชั้น ${esc(s.room||'...............')} | ชื่อ ${esc(s.name||'................................................')}</div><div class="detail">เลขประจำตัว ${esc(s.studentId||'................................')} • ฝนปากกาน้ำเงิน/ดำหรือดินสอให้ทึบ</div>`;}
 function omrPage(e,st,pageNo,inlineEssay=false){
  const s=st||{},total=Math.ceil(Number(e.numQuestions)/50),start=(pageNo-1)*50,count=Math.min(50,e.numQuestions-start),opts=[...e.choiceSet];
  const parts=[`<section class="page"><div class="mark" style="left:10mm;top:10mm"></div><div class="mark" style="left:192mm;top:10mm"></div><div class="mark" style="left:10mm;top:279mm"></div><div class="mark" style="left:192mm;top:279mm"></div>`,heading(e,s,'ปรนัย')];
  parts.push(`<div class="page-no">แผ่นที่ ${pageNo}/${total} • ข้อ ${start+1}–${start+count}</div>`);
  parts.push(`<img class="qr" src="${qr(`BSOMR2|${e.examId}|${s.studentId||''}|${pageNo}`)}">`);
  parts.push('<div class="small" style="left:20mm;top:48mm">รหัสนักเรียน (ระบบฝนให้เมื่อพิมพ์แบบรายบุคคล)</div>');
  const digits=/^\d{1,8}$/.test(String(s.studentId||''))?String(s.studentId).padStart(8,'0').split('').map(Number):[];
  for(let d=0;d<8;d++){
   parts.push(`<div class="digit" style="left:${mm(27+d*14)};top:52mm">${digits.length?digits[d]:'–'}</div>`);
   for(let r=0;r<10;r++)parts.push(`<div class="idcircle ${digits.length&&digits[d]===r?'solid':''}" style="left:${mm(29+d*14)};top:${mm(58+r*2.8)}"></div>`);
  }
  for(let r=0;r<10;r++)parts.push(`<div class="idlabel" style="top:${mm(57.6+r*2.8)}">${r}</div>`);
  parts.push('<div class="small" style="left:20mm;top:86mm">ระบายให้เต็มวง หากแก้ไขคำตอบโปรดทำเครื่องหมายให้ชัดเจน</div>');
  for(let q=0;q<count;q++){
   const col=Math.floor(q/25),row=q%25,base=23+col*92,y=93+row*6.7;
   parts.push(`<div class="question" style="left:${mm(base)};top:${mm(y-1.4)}">${start+q+1}.</div>`);
   opts.forEach((ch,j)=>{parts.push(`<div class="choice-label" style="left:${mm(base+28+j*10)};top:${mm(y-3.8)}">${esc(ch)}</div><div class="opt" style="left:${mm(base+28+j*10)};top:${mm(y)}"></div>`)});
  }
  if(inlineEssay && pageNo===total && e.essayMode==='same' && Number(e.essayCount)>0){
   const y0=Math.max(102,93+Math.min(count,25)*6.7+8);
   let y=y0;for(let q=1;q<=Number(e.essayCount);q++){
    const needed=12+Number(e.essayLines)*6;if(y+needed>272)break;
    parts.push(`<div class="essay-title" style="top:${mm(y)}">อัตนัยข้อ ${q} (ครูตรวจเอง)</div>`);
    for(let l=0;l<Number(e.essayLines);l++)parts.push(`<div class="line" style="top:${mm(y+9+l*6)}"></div>`);
    y+=needed+3;
   }
  }
  parts.push(`<div class="footer">รหัสชุด ${esc(e.examId.slice(0,8))} | แผ่น ${pageNo}/${total}</div></section>`);
  return parts.join('');
 }
 function essayPages(e,s,startQuestion=1){
  const n=Number(e.essayCount||0),lines=Number(e.essayLines||8);
  if(e.essayMode==='none'||n<=0)return [];
  const pages=[];let q=startQuestion;
  while(q<=n){
   let y=54,parts=[`<section class="page">`,heading(e,s,'อัตนัย'),'<div class="essay-note">อัตนัย: ครูตรวจและให้คะแนนเอง ไม่บันทึกเข้าสู่ระบบ OMR</div>'];
   while(q<=n){
    const needed=12+lines*6;
    if(y+needed>273)break;
    parts.push(`<div class="essay-title" style="top:${mm(y)}">อัตนัยข้อ ${q} (ครูตรวจเอง)</div>`);
    for(let i=0;i<lines;i++)parts.push(`<div class="line" style="top:${mm(y+9+i*6)}"></div>`);
    y+=needed+3;q++;
   }
   pages.push(parts.join('')+`<div class="footer">กระดาษอัตนัย • ไม่ใช้สแกน OMR</div></section>`);
  }
  return pages;
 }
 function print(exam,students){
  if(!exam||!Number.isInteger(Number(exam.numQuestions))||exam.numQuestions<1||exam.numQuestions>100)throw Error('ข้อสอบต้องมี 1–100 ข้อ');
  if(!window.QRCode)throw Error('โหลดไลบรารี QR Code ไม่สำเร็จ');
  const w=window.open('','_blank');if(!w)throw Error('กรุณาอนุญาตหน้าต่าง Popup สำหรับการพิมพ์');
  let pages=[];students.forEach(st=>{
   const total=Math.ceil(exam.numQuestions/50);
   let inlineCount=0;
   if(exam.essayMode==='same'&&exam.numQuestions<=25){
    const start=Math.max(102,93+exam.numQuestions*6.7+8);const each=15+Number(exam.essayLines)*6;
    inlineCount=Math.max(0,Math.min(Number(exam.essayCount),Math.floor((272-start)/each)));
   }
   for(let i=1;i<=total;i++)pages.push(omrPage(exam,st,i,inlineCount>0));
   // แบบ 'same' ใส่พื้นที่อัตนัยบนหน้า OMR เมื่อเหลือที่จริงเท่านั้น; ที่เหลือเพิ่มหน้า
   pages.push(...essayPages(exam,st||{},inlineCount+1));
  });
  const css=`@page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,'Sarabun',sans-serif;color:#111}.page{width:210mm;height:297mm;position:relative;break-after:page;page-break-after:always;overflow:hidden}.page:last-child{break-after:auto;page-break-after:auto}.mark{position:absolute;width:8mm;height:8mm;background:#000}.school{position:absolute;left:20mm;top:17mm;font-weight:700;font-size:13pt}.heading{position:absolute;left:20mm;top:25mm;font-size:9pt}.detail{position:relative;left:20mm;top:32mm;width:128mm;font-size:8.5pt;margin-bottom:1.8mm}.page-no{position:absolute;left:20mm;top:43mm;font-size:8pt;font-weight:bold}.qr{position:absolute;left:158mm;top:18mm;width:29mm;height:29mm}.small{position:absolute;font-size:8pt}.digit{position:absolute;width:7mm;text-align:center;font-size:8pt}.idcircle{position:absolute;width:2.3mm;height:2.3mm;border:.28mm solid black;border-radius:50%;background:#fff}.idcircle.solid{background:#000}.idlabel{position:absolute;left:19mm;font-size:6pt}.question{position:absolute;font-size:8pt}.choice-label{position:absolute;width:7.2mm;text-align:center;font-size:6pt;line-height:3mm}.opt{position:absolute;width:7.2mm;height:5.4mm;border:.28mm solid #222;border-radius:50%}.footer{position:absolute;right:17mm;bottom:10mm;font-size:7pt;color:#555}.essay-note{position:absolute;left:20mm;top:44mm;font-size:8pt}.essay-title{position:absolute;left:20mm;font-size:10pt;font-weight:bold}.line{position:absolute;left:20mm;width:170mm;border-bottom:.25mm solid #666;height:1mm}@media screen{body{background:#ddd}.page{background:white;margin:12px auto;box-shadow:0 3px 10px #aaa}}`;
  w.document.open();w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>กระดาษคำตอบ ${esc(exam.subjectCode)} </title><style>${css}</style></head><body>${pages.join('')}</body></html>`);w.document.close();w.focus();
  // Open in new tab ready to print; QR bitmaps are inline and need no network in popup
  setTimeout(()=>{try{if(w&&!w.closed)w.print()}catch(_){}},900);
 }
 return {print};
})();
