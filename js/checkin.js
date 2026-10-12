(() => {
  const $ = (s) => document.querySelector(s);
  const api = async (path, options={}) => {
    showLoader();
    try {
      const token = localStorage.getItem("gopass_admin_token") || "";
      const r = await fetch("/api" + path, { ...options, headers:{ "Content-Type":"application/json", ...(token?{Authorization:`Bearer ${token}`}:{}) , ...(options.headers||{}) }});
      const d = await r.json().catch(()=>({message:"เกิดข้อผิดพลาด"}));
      if(!r.ok) throw Object.assign(new Error(d.message||"เกิดข้อผิดพลาด"),{data:d,status:r.status});
      return d;
    } finally { hideLoader(); }
  };
  const esc = (v)=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const money=(n)=>Number(n||0).toLocaleString("th-TH")+" บาท";
  let events=[];
  async function boot(){
    if(!localStorage.getItem("gopass_admin_token")){loadPage("login.html");return;}
    const me=await api("/admin/me").catch(()=>null); if(!me){localStorage.removeItem("gopass_admin_token");loadPage("login.html");return;}
    const u=me.username||me.user?.username||"admin"; $("#adminUsername").textContent=u;
    events=await api("/events");
    const select=$("#eventSelect"); select.innerHTML='<option value="">เลือกงาน</option>'+events.map(e=>`<option value="${esc(e.id)}">${esc(e.name)} · ${esc(e.date)}</option>`).join("");
    const q=new URLSearchParams(location.search).get("event"); if(q&&events.some(e=>e.id===q)) select.value=q;
    await refreshStats();
  }
  async function refreshStats(){
    const id=$("#eventSelect").value; if(!id){["sold","checked","pending"].forEach(x=>$("#"+x).textContent="-");return;}
    const r=await api(`/admin/event-report/${encodeURIComponent(id)}`); $("#sold").textContent=r.summary.tickets.toLocaleString("th-TH"); $("#checked").textContent=r.summary.checkedInTickets.toLocaleString("th-TH"); $("#pending").textContent=r.summary.pendingTickets.toLocaleString("th-TH");
  }
  $("#eventSelect").addEventListener("change",refreshStats);
  $("#checkinForm").addEventListener("submit",async(e)=>{e.preventDefault();const ticketNo=$("#ticketNo").value.trim(),eventId=$("#eventSelect").value; if(!eventId)return show(false,"กรุณาเลือกงานก่อน",""); if(!ticketNo)return show(false,"กรุณากรอกเลขรายการ"," "); try{const d=await api("/admin/checkin",{method:"POST",body:JSON.stringify({ticketNo,eventId})});show(true,"เช็คอินสำเร็จ",d.order);$("#ticketNo").select();await refreshStats();}catch(err){show(false,err.message,err.data?.order||null);$("#ticketNo").select();}});
  function show(ok,title,o){const box=$("#result");box.className="checkin-result "+(ok?"ok":"bad");box.innerHTML=`<h2>${ok?'✓':'!'} ${esc(title)}</h2>`+(o?`<p><b>${esc(o.eventName||'')}</b></p><p>${esc(o.ticketName||o.ticketType||'')} × ${o.qty||0}</p>${o.seatLabels?`<p>ที่นั่ง ${esc(o.seatLabels)}</p>`:''}<p>คิว ${esc(o.queueCode||o.id||'-')}</p>${o.checkedInAt?`<p>เวลา ${new Date(o.checkedInAt).toLocaleString('th-TH')}</p>`:''}`:'');}
  $("#reportBtn").addEventListener("click",()=>{const id=$("#eventSelect").value;if(!id)return toast("กรุณาเลือกงานก่อน","error");loadPage(`report.html?event=${encodeURIComponent(id)}`);});
  window.adminLogout=async()=>{try{await api("/admin/logout",{method:"POST"})}catch{}localStorage.removeItem("gopass_admin_token");localStorage.removeItem("gopass_admin_user");loadPage("login.html");};
  boot().catch(e=>toast(e.message,"error"));
})();
