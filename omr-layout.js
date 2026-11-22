'use strict';
/** A4 coordinates in millimetres, shared between print and scanner. */
window.OMRLayout=Object.freeze({
 pageSize:100, markers:[[14,14],[196,14],[14,283],[196,283]],
 student:{x0:139,dx:11.9,y0:47,dy:4.5,r:1.98},
 forCount(total){
  const q=Number(total);
  if(!Number.isInteger(q)||q<1||q>100)throw Error('ต้องมีข้อสอบ 1–100 ข้อ');
  const columns=4;
  const rows=Math.ceil(q/columns);
  const pitch=6.25;
  const radius=2.35;
  const baseXs=columns===4?[27,73,119,165]:columns===3?[31,91,151]:[53,133];
  const choicePitch=columns===4?6.15:columns===3?7.5:8.7;
  return {columns,rows,pitch,radius,baseXs,choicePitch,y0:99,
   position(index,choice){const col=Math.floor(index/rows),row=index%rows;
    return {x:baseXs[col]+choice*choicePitch,y:99+row*pitch,col,row};}
  };
 }
});
const OMRLayout=window.OMRLayout;
