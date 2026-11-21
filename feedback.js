'use strict';
/** Confirmation, progress and status messages. Never interrupts automatic scanning. */
window.ExamUI=(()=>{
 const available=()=>typeof window.Swal!=='undefined'&&typeof Swal.fire==='function';
 const toast=(title,icon='success')=>{if(available())return Swal.fire({toast:true,position:'top-end',icon,title,showConfirmButton:false,timer:2300,timerProgressBar:true});};
 const alert=async(title,text,icon='info')=>available()?Swal.fire({title,text,icon,confirmButtonText:'ตกลง',confirmButtonColor:'#1d4ed8'}):window.alert(title+'\n'+text);
 const confirm=async(title,text,confirmText='ยืนยัน')=>available()?(await Swal.fire({title,text,icon:'question',showCancelButton:true,confirmButtonText:confirmText,cancelButtonText:'ยกเลิก',confirmButtonColor:'#1d4ed8',reverseButtons:true})).isConfirmed:window.confirm(title+'\n'+text);
 const busy=(title='กำลังดำเนินการ...')=>{if(available())Swal.fire({title,allowOutsideClick:false,allowEscapeKey:false,showConfirmButton:false,didOpen:()=>Swal.showLoading()});};
 const close=()=>{if(available()&&Swal.isVisible())Swal.close();};
 const task=async(title,fn,success)=>{busy(title);try{const result=await fn();close();if(success)toast(success);return result;}catch(e){close();await alert('ดำเนินการไม่สำเร็จ',e?.message||String(e),'error');throw e;}};
 return {toast,alert,confirm,busy,close,task};
})();
