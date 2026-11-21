'use strict';
/** A4 coordinates in millimetres, shared between print and scanner. */
window.OMRLayout=Object.freeze({
 pageSize:100, markers:[[14,14],[196,14],[14,283],[196,283]],
 student:{x0:139,dx:11.9,y0:47,dy:4.5,r:1.98},
 forCount(total){
  const q=Number(total);
  if(!Number.isInteger(q)||q<1||q>100)throw Error('ต้องมีข้อสอบ 1–100 ข้อ');
  const columns=q<=30?2:q<=60?3:4;
  const rows=Math.ceil(q/columns);
  const pitch=Math.min(columns===4?6.35:8.7, (256-105)/Math.max(1,rows-1));
  const radius=columns===4?2.38:3.0;
  const baseXs=columns===4?[27,73,119,165]:columns===3?[31,91,151]:[53,133];
  const choicePitch=columns===4?6.15:columns===3?7.5:8.7;
  return {columns,rows,pitch,radius,baseXs,choicePitch,y0:105,
   position(index,choice){const col=Math.floor(index/rows),row=index%rows;
    return {x:baseXs[col]+choice*choicePitch,y:105+row*pitch,col,row};}
  };
 }
});
const OMRLayout=window.OMRLayout;
