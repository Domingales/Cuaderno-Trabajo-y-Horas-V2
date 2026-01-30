/* assets/js/app.js - Cuaderno de Mantenimiento v6 (móvil) */
(function(){
  "use strict";

  const S = {
    view: "registros",
    editId: null,
    search: "",
    filtroPendientes: "todos",
    periodStart: "",
    periodEnd: "",
  };

  // -------- Utils
  const pad2 = (n)=>String(n).padStart(2,"0");
  function toMinHHMM(hhmm){
    const m = String(hhmm||"").match(/^(\d{1,2}):(\d{2})$/);
    if(!m) return null;
    const hh = Number(m[1]), mm = Number(m[2]);
    if(!Number.isFinite(hh)||!Number.isFinite(mm)) return null;
    if(hh<0||hh>47||mm<0||mm>59) return null;
    return (hh*60)+mm;
  }
  function diffMinutes(startHHMM, endHHMM){
    const a = toMinHHMM(startHHMM);
    const b = toMinHHMM(endHHMM);
    if(a==null || b==null) return null;
    let d = b - a;
    if(d < 0) d += 24*60; // turno nocturno
    return d;
  }
  function fmtHoursDec(h){
    const x = Number(h||0);
    const v = Number.isFinite(x) ? x : 0;
    return v.toFixed(2).replace(".", ",");
  }
  function hoursToHHMM(dec){
    const x = Number(dec||0);
    const total = Math.round((Number.isFinite(x)?x:0) * 60);
    const hh = Math.floor(total/60);
    const mm = total % 60;
    return `${pad2(hh)}:${pad2(mm)}`;
  }
  function safeText(s){ return String(s||""); }

  function confirmDanger(msg){
    return window.confirm(msg);
  }

  function download(filename, text){
    const blob = new Blob([text], {type:"application/json;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 200);
  }

  function pickFile(accept){
    return new Promise((resolve)=>{
      const input=document.createElement("input");
      input.type="file";
      input.accept = accept || "*/*";
      input.onchange=()=>resolve(input.files && input.files[0] ? input.files[0] : null);
      input.click();
    });
  }

  async function writeClipboard(text){
    if(navigator.clipboard && typeof navigator.clipboard.writeText==="function"){
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta=document.createElement("textarea");
    ta.value=String(text||"");
    ta.setAttribute("readonly","readonly");
    ta.style.position="fixed"; ta.style.left="-9999px"; ta.style.top="0";
    document.body.appendChild(ta);
    ta.select();
    let ok=false;
    try{ ok=document.execCommand("copy"); }catch(_){ ok=false; }
    document.body.removeChild(ta);
    return ok;
  }

  function escHtml(s){
    return String(s??"")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

  function toTSVCell(s){
    return String(s??"").replace(/\t/g," ").replace(/\r?\n/g," | ").trim();
  }

  function fmtTotalCell(horasTrab){
    const hhmm = hoursToHHMM(horasTrab);
    return `${hhmm} = ${fmtHoursDec(horasTrab)} h`;
  }

  function computeExtra(hTrab, hConv){
    const a = Number(hTrab)||0;
    let b = Number(hConv);
    if(!Number.isFinite(b) || b < 0) b = 0;
    return Math.max(0, a - b);
  }

  function formatTrabajoCompletadoItem(it){
    if(typeof it==="string") return String(it||"").trim();
    if(it && typeof it==="object"){
      const texto = String(it.texto ?? it.text ?? it.trabajo ?? "").trim();
      const mats = Array.isArray(it.materiales) ? it.materiales.map(m=>{
        const n = String(m?.nombre||"").trim();
        const c = (m?.cantidad==null ? "" : String(m.cantidad)).trim();
        if(!n && !c) return "";
        return c!=="" ? `${n} (${c})` : n;
      }).filter(Boolean) : [];
      if(mats.length){
        return `${texto || "(sin texto)"} [Mat: ${mats.join(", ")}]`;
      }
      return texto;
    }
    return "";
  }

  function completadosText(arr){
    return (arr||[]).map(formatTrabajoCompletadoItem).map(s=>String(s||"").trim()).filter(Boolean).join(" | ");
  }

  function completadosSearch(arr){
    return (arr||[]).map(it=>{
      if(typeof it==="string") return it;
      if(it && typeof it==="object"){
        const texto = String(it.texto ?? it.text ?? it.trabajo ?? "").trim();
        const mats = Array.isArray(it.materiales) ? it.materiales.map(m=>String(m?.nombre||"").trim()).filter(Boolean).join(" ") : "";
        return [texto, mats].join(" ").trim();
      }
      return "";
    }).join(" ");
  }

  function filterByPeriod(arr, start, end){
    const s = String(start||"").trim();
    const e = String(end||"").trim();
    return (arr||[]).filter(r=>{
      const d = String(r.fecha||"").slice(0,10);
      if(!d) return false;
      if(s && d < s) return false;
      if(e && d > e) return false;
      return true;
    });
  }

  function buildTSV(registros){
    const headers = [
      "Fecha","Empresa","Localidad","Ubicación","Inicio","Fin","Descanso",
      "Total horas","Horas convenio","Horas extra",
      "Materiales","Cantidades","Trabajos completados","Trabajos pendientes","Observaciones"
    ];
    const lines = [headers.join("\t")];
    for(const r of (registros||[])){
      const mats = (r.materiales||[]).map(m=>String(m?.nombre||"").trim()).filter(Boolean).join(" | ");
      const cants = (r.materiales||[]).map(m=>String(m?.cantidad??"").trim()).filter(x=>x!=="").join(" | ");
      const comp = completadosText(r.trabajosCompletados);
      const pend = (r.trabajosPendientes||[]).map(x=>String(x||"").trim()).filter(Boolean).join(" | ");
      const conv = (r.horasLegales!=null) ? r.horasLegales : 8;
      const extra = computeExtra(r.horasTrabajadas, conv);
      const row = [
        r.fecha||"",
        r.empresa||"",
        r.localidad||"",
        r.ubicacion||"",
        r.horaInicio||"",
        r.horaFin||"",
        r.descanso||"00:00",
        fmtTotalCell(r.horasTrabajadas),
        String(conv),
        fmtHoursDec(extra) + " h",
        mats,
        cants,
        comp,
        pend,
        r.observaciones||""
      ].map(toTSVCell);
      lines.push(row.join("\t"));
    }
    return lines.join("\n");
  }

  function printRegistros(registros, start, end){
    const title = "Registros guardados";
    const period = (start || end) ? `${start||"…"} → ${end||"…"}`
      : "Todos";
    const rows = (registros||[]).map(r=>{
      const conv = (r.horasLegales!=null) ? r.horasLegales : 8;
      const extra = computeExtra(r.horasTrabajadas, conv);
      const mats = (r.materiales||[]).map(m=>String(m?.nombre||"").trim()).filter(Boolean).join(" | ");
      const cants = (r.materiales||[]).map(m=>String(m?.cantidad??"").trim()).filter(x=>x!=="").join(" | ");
      const comp = completadosText(r.trabajosCompletados);
      const pend = (r.trabajosPendientes||[]).map(x=>String(x||"").trim()).filter(Boolean).join(" | ");
      return `<tr>
        <td>${escHtml(r.fecha||"")}</td>
        <td>${escHtml(r.empresa||"")}</td>
        <td>${escHtml(r.localidad||"")}</td>
        <td>${escHtml(r.ubicacion||"")}</td>
        <td>${escHtml(r.horaInicio||"")}</td>
        <td>${escHtml(r.horaFin||"")}</td>
        <td>${escHtml(r.descanso||"00:00")}</td>
        <td>${escHtml(fmtTotalCell(r.horasTrabajadas))}</td>
        <td>${escHtml(String(conv))}</td>
        <td>${escHtml(fmtHoursDec(extra) + " h")}</td>
        <td>${escHtml(mats)}</td>
        <td>${escHtml(cants)}</td>
        <td>${escHtml(comp)}</td>
        <td>${escHtml(pend)}</td>
        <td>${escHtml(r.observaciones||"")}</td>
      </tr>`;
    }).join("");

    const htmlDoc = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escHtml(title)}</title>
<style>
  body{ font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; margin:18px; color:#111; }
  h1{ font-size:18px; margin:0 0 4px; }
  .sub{ color:#555; font-size:12px; margin:0 0 12px; }
  table{ width:100%; border-collapse:collapse; font-size:11px; }
  th,td{ border:1px solid #ddd; padding:6px 6px; vertical-align:top; text-align:left; }
  th{ background:#f6f7f9; }
  @media print{ @page{ margin:10mm; } }
</style>
</head>
<body>
  <h1>${escHtml(title)}</h1>
  <p class="sub">Periodo: ${escHtml(period)} · Registros: ${(registros||[]).length}</p>
  <table>
    <thead><tr>
      <th>Fecha</th><th>Empresa</th><th>Localidad</th><th>Ubicación</th>
      <th>Inicio</th><th>Fin</th><th>Descanso</th><th>Total</th>
      <th>Convenio</th><th>Extra</th>
      <th>Materiales</th><th>Cant.</th><th>Completado</th><th>Pendiente</th><th>Observaciones</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload=()=>{ setTimeout(()=>window.print(), 120); };</script>
</body></html>`;

    const w = window.open("", "_blank");
    if(w){
      w.document.open(); w.document.write(htmlDoc); w.document.close();
      return;
    }
    const iframe=document.createElement("iframe");
    iframe.style.position="fixed";
    iframe.style.right="0";
    iframe.style.bottom="0";
    iframe.style.width="0";
    iframe.style.height="0";
    iframe.style.border="0";
    document.body.appendChild(iframe);
    const doc=iframe.contentWindow.document;
    doc.open(); doc.write(htmlDoc); doc.close();
    setTimeout(()=>{
      try{ iframe.contentWindow.focus(); iframe.contentWindow.print(); }catch(_){}
      setTimeout(()=>iframe.remove(), 800);
    }, 200);
  }

  // -------- UI builders
  function card(title, subtitle=null){
    const c = UI.el("section",{class:"card"});
    const h = UI.el("div",{class:"row", style:"justify-content:space-between;align-items:flex-start"});
    const left = UI.el("div",{});
    left.appendChild(UI.el("h2",{}, title));
    if(subtitle) left.appendChild(UI.el("div",{class:"tiny muted"}, subtitle));
    h.appendChild(left);
    c.appendChild(h);
    return c;
  }

  function kpiItem(value, label){
    const k = UI.el("div",{class:"k"});
    k.appendChild(UI.el("div",{class:"n"}, value));
    k.appendChild(UI.el("div",{class:"t"}, label));
    return k;
  }

  function btn(label, cls, onClick, small=false){
    return UI.el("button",{type:"button", class:`btn ${cls||""} ${small?"btnSmall":""}`.trim(), onclick:onClick}, label);
  }

  function inputRow(labelText, inputEl){
    const w=UI.el("div",{class:"form-row"});
    w.appendChild(UI.el("div",{class:"label"}, labelText));
    w.appendChild(inputEl);
    return w;
  }

  function timeRow(labelText, defaultValue=""){
    const i = UI.el("input",{class:"input", type:"time", value: defaultValue || ""});
    return { wrap: inputRow(labelText, i), input: i };
  }

  // -------- Data access
  function getRegistros(){
    return StorageMT.loadRegistros();
  }
  function getPagos(){
    return StorageMT.loadPagos();
  }

  function calcTotals(registros, pagos){
    const totalTrab = registros.reduce((a,r)=>a + (Number(r.horasTrabajadas)||0), 0);
    const totalExtra = registros.reduce((a,r)=>a + Math.max(0, (Number(r.horasTrabajadas)||0) - (Number(r.horasLegales)||0)), 0);
    const totalPagos = pagos.reduce((a,p)=>a + (Number(p.horas)||0), 0);
    const balance = totalExtra - totalPagos;
    return { totalTrab, totalExtra, totalPagos, balance };
  }

  // -------- Views
  function renderRegistros(container){
    UI.setPage("Registros", "Partes de trabajo", {
      label:"➕ Nuevo",
      onClick: ()=>{ S.editId=null; App.go("form"); }
    });

    const registros = getRegistros();
    const pagos = getPagos();
    const totals = calcTotals(registros, pagos);

    const top = UI.el("div",{class:"card"});
    const kpi = UI.el("div",{class:"kpi"});
    kpi.appendChild(kpiItem(fmtHoursDec(totals.totalExtra), "Total horas extra"));
    kpi.appendChild(kpiItem(fmtHoursDec(totals.totalPagos), "Total horas cobradas"));
    kpi.appendChild(kpiItem(fmtHoursDec(totals.balance), "Balance (debe empresa)"));
    top.appendChild(kpi);
    top.appendChild(UI.el("hr",{class:"sep"}));

    const search = UI.el("input",{class:"input", placeholder:"Buscar por localidad / texto…", value: S.search});
    search.addEventListener("input", ()=>{ S.search = search.value; render(); });

    const select = UI.el("select",{class:"select"});
    select.innerHTML = `
      <option value="todos">Todos los registros</option>
      <option value="conPendientes">Solo con trabajos pendientes</option>
      <option value="sinPendientes">Solo sin trabajos pendientes</option>`;
    select.value = S.filtroPendientes;
    select.addEventListener("change", ()=>{ S.filtroPendientes = select.value; render(); });

    const row = UI.el("div",{class:"grid cols2"});
    row.appendChild(inputRow("Buscar", search));
    row.appendChild(inputRow("Mostrar", select));
    top.appendChild(row);

    const actions = UI.el("div",{class:"row", style:"flex-wrap:wrap;justify-content:flex-end;margin-top:10px"});
    actions.appendChild(btn("🧹 Borrar TODOS", "btnDanger", ()=>{
      if(!confirmDanger("¿Seguro que quieres borrar TODOS los registros? Esto no se puede deshacer.")) return;
      StorageMT.clearRegistros();
      UI.toast("Registros borrados.");
      render();
    }, true));

    top.appendChild(actions);
    container.appendChild(top);

    // Table
    const tCard = card("Registros guardados", `${registros.length} registros`);

    // --- Periodo (listados / exportación)
    const dates = registros.map(r=>String(r.fecha||"").slice(0,10)).filter(Boolean).sort();
    const minDate = dates.length ? dates[0] : new Date().toISOString().slice(0,10);
    const maxDate = dates.length ? dates[dates.length-1] : new Date().toISOString().slice(0,10);
    if(!S.periodStart) S.periodStart = minDate;
    if(!S.periodEnd) S.periodEnd = maxDate;

    const rowPeriod = UI.el("div",{class:"grid cols3"});
    const inpStart = UI.el("input",{class:"input", type:"date", value:S.periodStart});
    const inpEnd = UI.el("input",{class:"input", type:"date", value:S.periodEnd});
    inpStart.addEventListener("change", ()=>{ S.periodStart = inpStart.value; render(); });
    inpEnd.addEventListener("change", ()=>{ S.periodEnd = inpEnd.value; render(); });

    rowPeriod.appendChild(inputRow("Fecha inicio (listados)", inpStart));
    rowPeriod.appendChild(inputRow("Fecha fin (listados)", inpEnd));

    const boxBtns = UI.el("div",{class:"form-row"});
    boxBtns.appendChild(UI.el("div",{class:"label"},"Acciones del periodo"));
    const btnRow = UI.el("div",{class:"row", style:"flex-wrap:wrap;justify-content:flex-end"});

    btnRow.appendChild(btn("🖨️ IMPRIMIR", "btnPrimary", ()=>{
      const list = filterByPeriod(registros, S.periodStart, S.periodEnd).filter(r=>{
        const q = String(S.search||"").trim().toLowerCase();
        if(q){
          const hay = [
            r.fecha, r.empresa, r.localidad, r.ubicacion,
            (r.materiales||[]).map(m=>m.nombre).join(" "),
            completadosSearch(r.trabajosCompletados),
            (r.trabajosPendientes||[]).join(" "),
            r.observaciones
          ].join(" ").toLowerCase();
          if(!hay.includes(q)) return false;
        }
        const pend = (r.trabajosPendientes||[]).map(s=>String(s||"").trim()).filter(Boolean);
        if(S.filtroPendientes==="conPendientes") return pend.length>0;
        if(S.filtroPendientes==="sinPendientes") return pend.length===0;
        return true;
      });
      if(!list.length){ UI.toast("No hay registros en el periodo seleccionado."); return; }
      printRegistros(list, S.periodStart, S.periodEnd);
    }));

    btnRow.appendChild(btn("📋 EXCEL", "btnSuccess", async()=>{
      const list = filterByPeriod(registros, S.periodStart, S.periodEnd).filter(r=>{
        const q = String(S.search||"").trim().toLowerCase();
        if(q){
          const hay = [
            r.fecha, r.empresa, r.localidad, r.ubicacion,
            (r.materiales||[]).map(m=>m.nombre).join(" "),
            completadosSearch(r.trabajosCompletados),
            (r.trabajosPendientes||[]).join(" "),
            r.observaciones
          ].join(" ").toLowerCase();
          if(!hay.includes(q)) return false;
        }
        const pend = (r.trabajosPendientes||[]).map(s=>String(s||"").trim()).filter(Boolean);
        if(S.filtroPendientes==="conPendientes") return pend.length>0;
        if(S.filtroPendientes==="sinPendientes") return pend.length===0;
        return true;
      });
      if(!list.length){ UI.toast("No hay registros en el periodo seleccionado."); return; }
      const tsv = buildTSV(list);
      try{
        const ok = await writeClipboard(tsv);
        if(ok) UI.toast("Listado copiado para Excel (pega en Excel).");
        else UI.toast("No se pudo copiar. Prueba en otro navegador o pega manualmente.");
      }catch(e){
        UI.toast(e.message || "Error copiando a portapapeles.");
      }
    }));

    btnRow.appendChild(btn("Todo", "", ()=>{ S.periodStart=minDate; S.periodEnd=maxDate; render(); }, true));

    boxBtns.appendChild(btnRow);
    rowPeriod.appendChild(boxBtns);
    tCard.appendChild(rowPeriod);
    tCard.appendChild(UI.el("hr",{class:"sep"}));

    const wrap = UI.el("div",{class:"tableWrap"});

    const table = UI.el("table",{class:"table"});
    table.appendChild(UI.el("thead",{}, UI.el("tr",{}, [
      UI.el("th",{},"Fecha"),
      UI.el("th",{},"Empresa"),
      UI.el("th",{},"Localidad"),
      UI.el("th",{},"Ubicación"),
      UI.el("th",{},"Inicio"),
      UI.el("th",{},"Fin"),
      UI.el("th",{},"Descanso"),
      UI.el("th",{},"Horas"),
      UI.el("th",{},"Extra"),
      UI.el("th",{},"Materiales"),
      UI.el("th",{},"Cant."),
      UI.el("th",{},"Completado"),
      UI.el("th",{},"Pendiente"),
      UI.el("th",{},"Observaciones"),
      UI.el("th",{},"Acciones"),
    ])));

    const tbody = UI.el("tbody");
    const filtered = filterByPeriod(registros, S.periodStart, S.periodEnd).filter(r=>{
      const q = String(S.search||"").trim().toLowerCase();
      let ok=true;
      if(q){
        const hay = [
          r.fecha, r.empresa, r.localidad, r.ubicacion,
          (r.materiales||[]).map(m=>m.nombre).join(" "),
          completadosSearch(r.trabajosCompletados),
          (r.trabajosPendientes||[]).join(" "),
          r.observaciones
        ].join(" ").toLowerCase();
        ok = hay.includes(q);
      }
      if(!ok) return false;
      const pend = (r.trabajosPendientes||[]).map(s=>String(s||"").trim()).filter(Boolean);
      if(S.filtroPendientes==="conPendientes") return pend.length>0;
      if(S.filtroPendientes==="sinPendientes") return pend.length===0;
      return true;
    });

    for(const r of filtered){
      const mats = (r.materiales||[]).map(m=>String(m?.nombre||"").trim()).filter(Boolean);
      const cants = (r.materiales||[]).map(m=>String(m?.cantidad||"").trim()).filter(x=>x!=="");
      const complet = (r.trabajosCompletados||[]).map(formatTrabajoCompletadoItem).map(s=>String(s||"").trim()).filter(Boolean);
      const pend = (r.trabajosPendientes||[]).map(s=>String(s||"").trim()).filter(Boolean);

      const td = (txt)=>UI.el("td",{}, safeText(txt));
      const tdMulti = (arr)=>{
        const t = UI.el("td");
        const text = (arr||[]).join("\n");
        const pre = UI.el("div",{style:"white-space:pre-wrap;"} , text);
        t.appendChild(pre);
        return t;
      };

      const tr = UI.el("tr");
      tr.appendChild(td(r.fecha));
      tr.appendChild(td(r.empresa));
      tr.appendChild(td(r.localidad));
      tr.appendChild(td(r.ubicacion));
      tr.appendChild(td(r.horaInicio));
      tr.appendChild(td(r.horaFin));
      tr.appendChild(td(r.descanso));
      tr.appendChild(td(hoursToHHMM(r.horasTrabajadas)));
      tr.appendChild(td(fmtHoursDec(Math.max(0, (Number(r.horasTrabajadas)||0) - (Number(r.horasLegales)||0)))));
      tr.appendChild(tdMulti(mats));
      tr.appendChild(tdMulti(cants));
      tr.appendChild(tdMulti(complet));
      tr.appendChild(tdMulti(pend));
      tr.appendChild(tdMulti([r.observaciones||""]));

      const tdAct = UI.el("td");
      const rowAct = UI.el("div",{class:"row", style:"flex-wrap:wrap"});
      rowAct.appendChild(UI.el("button",{type:"button", class:"iconBtn small secondary", onclick:()=>{ S.editId=r.id; App.go("form"); }}, "✏️"));
      rowAct.appendChild(UI.el("button",{type:"button", class:"iconBtn small danger", onclick:()=>{
        if(!confirmDanger("¿Borrar este registro?")) return;
        StorageMT.deleteRegistro(r.id);
        UI.toast("Registro borrado.");
        render();
      }}, "🗑️"));
      tdAct.appendChild(rowAct);
      tr.appendChild(tdAct);

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
    tCard.appendChild(wrap);

    container.appendChild(tCard);
  }

  function makeMaterialRow(data){
    const row = UI.el("div",{class:"form-row-inline"});

    const name = UI.el("input",{class:"input", placeholder:"Rodamiento…", value: data?.nombre || ""});
    const qty  = UI.el("input",{class:"input", type:"number", min:"0", step:"1", placeholder:"Cant.", value: data?.cantidad ?? ""});

    const nameBox = UI.el("div",{class:"flex-grow"});
    nameBox.appendChild(UI.el("div",{class:"label"},"Material"));
    nameBox.appendChild(name);

    const qtyBox = UI.el("div",{class:"cantidad-box"});
    qtyBox.appendChild(UI.el("div",{class:"label"},"Cant."));
    qtyBox.appendChild(qty);

    const btns = UI.el("div",{style:"display:flex;gap:8px;margin-left:auto;flex:0 0 auto;align-items:flex-start"});
    const add = UI.el("button",{type:"button", class:"btn btnSmall", style:"min-width:44px"}, "＋");
    const del = UI.el("button",{type:"button", class:"btn btnSmall btnDanger", style:"min-width:44px"}, "－");

    btns.appendChild(add);
    btns.appendChild(del);

    row.appendChild(nameBox);
    row.appendChild(qtyBox);
    row.appendChild(btns);

    return { row, name, qty, add, del };
  }

  function makeTrabajoRow(kind, data){
    const row = UI.el("div",{class:"form-row-inline", style:"width:100%;align-items:stretch"});
    const ta = UI.el("textarea",{
      class:"textarea",
      rows:"2",
      placeholder: kind==="pend" ? "Ej: Revisar poleas, revisar motor…" : "Ej: Cambio de correa, engrase…",
      style:"flex:1;min-width:0"
    }, String(data||""));

    const add = UI.el("button",{type:"button", class:"btn btnSmall", style:"min-width:44px"}, "＋");
    const del = UI.el("button",{type:"button", class:"btn btnSmall btnDanger", style:"min-width:44px"}, "－");

    const btns = UI.el("div",{style:"display:flex;gap:8px;margin-left:auto;flex:0 0 auto;align-items:flex-start"});
    btns.appendChild(add);
    btns.appendChild(del);

    row.appendChild(ta);
    row.appendChild(btns);
    return { row, ta, add, del };
  }

  function makeTrabajoCompletadoRow(data){
    const wrap = UI.el("div",{style:"margin-bottom:10px"});

    // Parte superior: texto + botones +/-
    const rowTop = UI.el("div",{class:"form-row-inline", style:"width:100%;align-items:stretch"});
    const ta = UI.el("textarea",{
      class:"textarea",
      rows:"2",
      placeholder:"Ej: Cambio de correa, engrase…",
      style:"flex:1"
    }, (typeof data==="string" ? data : (data?.texto ?? data?.text ?? data?.trabajo ?? "")) || "");

    const btns = UI.el("div",{style:"display:flex;gap:8px"});
    const add = UI.el("button",{type:"button", class:"btn btnSmall", style:"min-width:44px"}, "＋");
    const del = UI.el("button",{type:"button", class:"btn btnSmall btnDanger", style:"min-width:44px"}, "－");
    btns.appendChild(add); btns.appendChild(del);

    rowTop.appendChild(ta);
    rowTop.appendChild(btns);
    wrap.appendChild(rowTop);

    // Materiales del trabajo
    wrap.appendChild(UI.el("div",{class:"tiny muted", style:"margin:6px 0 4px 2px"},"Materiales de este trabajo"));
    const matsHost = UI.el("div",{});
    const matRows = [];

    function addMatRow(m, focus=false){
      const it = makeMaterialRow(m||{});
      matRows.push(it);
      matsHost.appendChild(it.row);

      it.add.onclick=()=>addMatRow({}, true);
      it.del.onclick=()=>{
        if(matRows.length===1){
          it.name.value=""; it.qty.value="";
          return;
        }
        const idx = matRows.indexOf(it);
        if(idx>=0) matRows.splice(idx,1);
        it.row.remove();
      };

      if(focus) it.name.focus();
    }

    const initMats = (data && typeof data==="object" && Array.isArray(data.materiales) && data.materiales.length)
      ? data.materiales
      : [{}];
    for(const mm of initMats) addMatRow(mm);

    wrap.appendChild(matsHost);

    function getMateriales(){
      return matRows
        .map(it=>({ nombre: it.name.value.trim(), cantidad: it.qty.value }))
        .filter(m=>m.nombre || String(m.cantidad||"").trim()!=="");
    }

    function clear(){
      ta.value = "";
      // deja solo 1 fila de material vacía
      while(matRows.length>1){
        const it = matRows.pop();
        it.row.remove();
      }
      if(matRows[0]){
        matRows[0].name.value="";
        matRows[0].qty.value="";
      }
    }

    return { row: wrap, ta, add, del, getMateriales, clear };
  }

  function renderForm(container){
    const isEdit = !!S.editId;
    UI.setPage(isEdit ? "Editar registro" : "Nuevo registro", "Completa los datos y guarda", {
      label:"⟵ Volver",
      onClick: ()=>{ App.go("registros"); }
    });

    const registros = getRegistros();
    const current = isEdit ? registros.find(r=>r.id===S.editId) : null;

    const c = card(isEdit ? "Editar" : "Nuevo registro", isEdit ? `ID: ${S.editId}` : null);

    // Inputs
    const fecha = UI.el("input",{class:"input", type:"date", required:"required", value: current?.fecha || new Date().toISOString().slice(0,10)});
    const empresa = UI.el("input",{class:"input", type:"text", placeholder:"Ej: Santísimo Cristo", value: current?.empresa || ""});
    const localidad = UI.el("input",{class:"input", type:"text", placeholder:"Ej: Malagón", required:"required", value: current?.localidad || ""});
    const ubicacion = UI.el("input",{class:"input", type:"text", placeholder:"Ej: Polígono", required:"required", value: current?.ubicacion || ""});

    const horaIni = UI.el("input",{class:"input", type:"time", required:"required", value: current?.horaInicio || ""});
    const horaFin = UI.el("input",{class:"input", type:"time", required:"required", value: current?.horaFin || ""});
    const descanso = UI.el("input",{class:"input", type:"time", value: current?.descanso || "00:00"});
    const horasConvenio = UI.el("input",{class:"input", type:"number", step:"0.25", min:"0", value: String((current && current.horasLegales!=null) ? current.horasLegales : 8)});
    const totalHoras = UI.el("input",{class:"input readonly", type:"text", readOnly:"readonly", value:""});
    const extraHoras = UI.el("input",{class:"input readonly", type:"text", readOnly:"readonly", value:""});

    function recalc(){
      const d = diffMinutes(horaIni.value, horaFin.value);
      const ds = toMinHHMM(descanso.value);
      if(d==null){
        totalHoras.value = "";
        extraHoras.value = "";
        return;
      }
      const rest = ds!=null ? ds : 0;
      const workedMin = Math.max(0, d - rest);
      const dec = workedMin/60;
      totalHoras.value = `${hoursToHHMM(dec)} (${fmtHoursDec(dec)} h)`;
      let legal = (horasConvenio && horasConvenio.value !== "") ? Number(horasConvenio.value) : 8;
      if(!Number.isFinite(legal) || legal < 0) legal = 0;
      const extra = Math.max(0, dec - legal);
      extraHoras.value = `${fmtHoursDec(extra)} h`;
    }

    for(const i of [horaIni,horaFin,descanso,horasConvenio]) i.addEventListener("input", recalc);

    // Trabajos completados dynamic (cada trabajo incluye sus materiales)
    const compHost = UI.el("div",{});
    const compRows=[];
    function addCompRow(data, focus=false){
      const it = makeTrabajoCompletadoRow(data || {});
      compRows.push(it);
      compHost.appendChild(it.row);
      it.add.onclick=()=>addCompRow({texto:"", materiales:[{}]}, true);
      it.del.onclick=()=>{
        if(compRows.length===1){ it.clear(); return; }
        const idx=compRows.indexOf(it);
        if(idx>=0) compRows.splice(idx,1);
        it.row.remove();
      };
      if(focus) it.ta.focus();
    }

    const initComp = (current?.trabajosCompletados && current.trabajosCompletados.length)
      ? current.trabajosCompletados
      : [{texto:"", materiales:[{}]}];
    for(const t of initComp) addCompRow(t);

    // Trabajos pendientes dynamic
    const pendHost = UI.el("div",{});
    const pendRows=[];
    function addPendRow(text, focus=false){
      const it = makeTrabajoRow("pend", text); // <-- FIX: usar "pend" para placeholder correcto
      pendRows.push(it);
      pendHost.appendChild(it.row);
      it.add.onclick=()=>addPendRow("", true);
      it.del.onclick=()=>{
        if(pendRows.length===1){ it.ta.value=""; return; }
        const idx=pendRows.indexOf(it);
        if(idx>=0) pendRows.splice(idx,1);
        it.row.remove();
      };
      if(focus) it.ta.focus();
    }
    const initPend = (current?.trabajosPendientes && current.trabajosPendientes.length) ? current.trabajosPendientes : [""];
    for(const t of initPend) addPendRow(t);

    const observ = UI.el("textarea",{class:"textarea", rows:"2", placeholder:"Ruido leve, se recomienda revisar en 1 semana…"}, current?.observaciones || "");

    // Layout
    c.appendChild(UI.el("div",{class:"grid cols2"}, [
      inputRow("Fecha", fecha),
      inputRow("Empresa", empresa),
      inputRow("Localidad", localidad),
      inputRow("Ubicación", ubicacion),
    ]));

    const times = UI.el("div",{class:"form-row-inline"});
    const box = (lbl, elx)=>{
      const d=UI.el("div",{});
      d.appendChild(UI.el("div",{class:"label"}, lbl));
      d.appendChild(elx);
      return d;
    };
    times.appendChild(box("Inicio", horaIni));
    times.appendChild(box("Fin", horaFin));
    times.appendChild(box("Descanso", descanso));
    times.appendChild(box("Horas convenio", horasConvenio));
    times.appendChild(box("Horas trabajadas", totalHoras));
    times.appendChild(box("Horas extra", extraHoras));
    c.appendChild(times);

    c.appendChild(UI.el("div",{class:"sep"}));

    c.appendChild(UI.el("hr",{class:"sep"}));
    c.appendChild(UI.el("div",{class:"label"},"Trabajos completados"));
    c.appendChild(compHost);

    c.appendChild(UI.el("hr",{class:"sep"}));
    c.appendChild(UI.el("div",{class:"label"},"Trabajos pendientes"));
    c.appendChild(pendHost);

    c.appendChild(UI.el("hr",{class:"sep"}));
    c.appendChild(inputRow("Observaciones", observ));

    const actions = UI.el("div",{class:"row", style:"justify-content:flex-end;flex-wrap:wrap;gap:10px"});
    actions.appendChild(btn("Cancelar / Limpiar", "", ()=>{
      if(isEdit){
        S.editId=null;
        App.go("registros");
        return;
      }
      // reset
      empresa.value=""; localidad.value=""; ubicacion.value="";
      horaIni.value=""; horaFin.value=""; descanso.value="00:00";
      for(const it of compRows){ it.clear(); }          // <-- FIX: limpiar cada trabajo + sus materiales
      for(const it of pendRows){ it.ta.value=""; }
      observ.value="";
      recalc();
      UI.toast("Formulario limpiado.");
    }));

    actions.appendChild(btn("Guardar registro", "btnPrimary", ()=>{
      // validación mínima
      if(!fecha.value){ UI.toast("Falta la fecha."); return; }
      if(!localidad.value.trim()){ UI.toast("Falta la localidad."); return; }
      if(!ubicacion.value.trim()){ UI.toast("Falta la ubicación."); return; }
      if(!horaIni.value || !horaFin.value){ UI.toast("Faltan horas de inicio/fin."); return; }

      const d = diffMinutes(horaIni.value, horaFin.value);
      if(d==null){ UI.toast("Horas de inicio/fin no válidas."); return; }
      const rest = toMinHHMM(descanso.value) || 0;
      const workedMin = Math.max(0, d - rest);
      const horasTrab = workedMin/60;
      let legal = (horasConvenio && horasConvenio.value !== "") ? Number(horasConvenio.value) : 8;
      if(!Number.isFinite(legal) || legal < 0) legal = 0;
      const horasExtra = Math.max(0, horasTrab - legal);

      const trabajosCompletados = compRows
        .map(it=>{
          const texto = it.ta.value.trim();
          const mats = it.getMateriales();
          if(!texto && !mats.length) return null;
          return { texto, materiales: mats };
        })
        .filter(Boolean);

      // Compatibilidad: mantenemos también un agregado de materiales a nivel de registro
      const materiales = trabajosCompletados
        .flatMap(t=>Array.isArray(t.materiales) ? t.materiales : [])
        .map(m=>({ nombre: String(m?.nombre||"").trim(), cantidad: (m?.cantidad==null ? "" : String(m.cantidad)).trim() }))
        .filter(m=>m.nombre || String(m.cantidad||"").trim()!=="");

      const trabajosPendientes = pendRows.map(it=>it.ta.value.trim()).filter(Boolean);

      const obj = {
        fecha: fecha.value,
        empresa: empresa.value.trim(),
        localidad: localidad.value.trim(),
        ubicacion: ubicacion.value.trim(),
        horaInicio: horaIni.value,
        horaFin: horaFin.value,
        descanso: descanso.value || "00:00",
        horasLegales: legal,
        horasTrabajadas: horasTrab,
        horasExtra: horasExtra,
        materiales,
        trabajosCompletados,
        trabajosPendientes,
        observaciones: observ.value.trim()
      };

      if(isEdit){
        StorageMT.updateRegistro(S.editId, obj);
        UI.toast("Registro actualizado.");
        S.editId=null;
      }else{
        StorageMT.addRegistro(obj);
        UI.toast("Registro guardado.");
      }
      App.go("registros");
    },""));

    c.appendChild(actions);

    container.appendChild(c);
    recalc();
  }

  function renderExtra(container){
    UI.setPage("Horas extra", "Pagos y balance", null);

    const registros = getRegistros();
    const pagos = getPagos();
    const totals = calcTotals(registros, pagos);

    const c = card("Resumen", "Se calcula automáticamente con los registros diarios. Los pagos se introducen manualmente.");
    const kpi = UI.el("div",{class:"kpi"});
    kpi.appendChild(kpiItem(fmtHoursDec(totals.totalExtra), "Total horas extras"));
    kpi.appendChild(kpiItem(fmtHoursDec(totals.totalPagos), "Total horas cobradas"));
    kpi.appendChild(kpiItem(fmtHoursDec(totals.balance), "Balance (debe empresa)"));
    c.appendChild(kpi);
    c.appendChild(UI.el("hr",{class:"sep"}));

    // Add payment form
    const fecha = UI.el("input",{class:"input", type:"date", value:new Date().toISOString().slice(0,10)});
    const horas = UI.el("input",{class:"input", type:"number", step:"0.25", min:"0", placeholder:"Horas cobradas (ej: 5)", value:""});
    const nota = UI.el("input",{class:"input", type:"text", placeholder:"Nota (opcional)", value:""});

    const grid = UI.el("div",{class:"grid cols3"});
    grid.appendChild(inputRow("Fecha de pago", fecha));
    grid.appendChild(inputRow("Horas cobradas", horas));
    grid.appendChild(inputRow("Nota", nota));
    c.appendChild(grid);

    const row = UI.el("div",{class:"row", style:"justify-content:flex-end;flex-wrap:wrap"});
    row.appendChild(btn("Añadir pago", "btnSuccess", ()=>{
      const h = Number(horas.value);
      if(!Number.isFinite(h) || h<=0){ UI.toast("Introduce horas cobradas válidas."); return; }
      StorageMT.addPago({ fecha: fecha.value, horas: h, nota: nota.value.trim() });
      horas.value=""; nota.value="";
      UI.toast("Pago guardado.");
      render();
    }));
    c.appendChild(row);
    container.appendChild(c);

    // Payments list
    const list = card("Pagos registrados", `${pagos.length} pagos`);
    if(!pagos.length){
      list.appendChild(UI.el("div",{class:"tiny muted"},"Aún no hay pagos. Añade el primero arriba."));
      container.appendChild(list);
      return;
    }

    const wrap = UI.el("div",{class:"tableWrap"});
    const table = UI.el("table",{class:"table", style:"min-width:680px"});
    table.appendChild(UI.el("thead",{}, UI.el("tr",{}, [
      UI.el("th",{},"Fecha"),
      UI.el("th",{},"Horas"),
      UI.el("th",{},"Nota"),
      UI.el("th",{},"Acciones"),
    ])));
    const tbody = UI.el("tbody");
    for(const p of pagos){
      const tr = UI.el("tr");
      tr.appendChild(UI.el("td",{}, p.fecha || ""));
      tr.appendChild(UI.el("td",{}, fmtHoursDec(p.horas)));
      tr.appendChild(UI.el("td",{}, p.nota || ""));
      const td = UI.el("td");
      td.appendChild(UI.el("button",{type:"button", class:"iconBtn small danger", onclick:()=>{
        if(!confirmDanger("¿Borrar este pago?")) return;
        StorageMT.deletePago(p.id);
        UI.toast("Pago borrado.");
        render();
      }}, "🗑️"));
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    list.appendChild(wrap);
    container.appendChild(list);
  }

  function renderBackup(container){
    UI.setPage("Backup", "Exportar / Importar", null);

    const c = card("Copias de seguridad", "Exporta a archivo, copia al portapapeles o restaura pegando el contenido.");
    const row = UI.el("div",{class:"row", style:"flex-wrap:wrap"});

    row.appendChild(btn("📤 Exportar JSON", "btnPrimary", ()=>{
      const registros = getRegistros();
      const pagos = getPagos();
      const pack = {
        meta:{ app:"Cuaderno Mantenimiento", createdAt:new Date().toISOString(), version:1 },
        data:{
          [StorageMT.KEY_REGISTROS]: JSON.stringify(registros),
          [StorageMT.KEY_OLD_TRABAJOS]: JSON.stringify(registros),
          [StorageMT.KEY_EXTRA_PAGOS]: JSON.stringify(pagos),
        }
      };
      const name = `backup_mantenimiento_${new Date().toISOString().slice(0,10)}.json`;
      download(name, JSON.stringify(pack, null, 2));
    }));

    row.appendChild(btn("📥 Importar JSON", "btnWarn", async()=>{
      const f = await pickFile("application/json");
      if(!f) return;
      const text = await f.text();
      try{
        const obj = JSON.parse(text);
        // acepta {meta,data} o {meta,storage} del módulo BackupClipboard
        const storage = obj.storage || obj.data;
        if(!storage || typeof storage!=="object") throw new Error("Formato no reconocido.");
        // por defecto replace
        localStorage.clear();
        for(const [k,v] of Object.entries(storage)){
          localStorage.setItem(k, String(v));
        }
        UI.toast("Importación completada. Se recarga…");
        setTimeout(()=>location.reload(), 400);
      }catch(e){
        UI.toast(e.message || "Error importando.");
      }
    }));

    row.appendChild(btn("📋 Copiar backup", "btnSuccess", async()=>{
      try{
        await BackupClipboard.copyBackupToClipboard({ appName:"Cuaderno Mantenimiento" });
      }catch(e){
        UI.toast(e.message || "No se pudo copiar.");
      }
    }));

    row.appendChild(btn("🧩 Pegar / Restaurar", "btnWarn", ()=>{
      BackupClipboard.openPasteWindow({ title:"Restaurar / Importar (pegar)", mode:"replace", onDone:()=>{} });
    }));

    row.appendChild(btn("🗑️ Borrar TODO", "btnDanger", ()=>{
      if(!confirmDanger("¿Seguro que quieres borrar TODOS los datos (registros + pagos) del dispositivo?")) return;
      localStorage.clear();
      UI.toast("Datos borrados. Recargando…");
      setTimeout(()=>location.reload(), 350);
    }));

    c.appendChild(row);
    c.appendChild(UI.el("hr",{class:"sep"}));
    c.appendChild(UI.el("div",{class:"tiny muted"}, "Consejo: guarda un backup semanal. La opción de “Pegar / Restaurar” acepta un JSON de backup o una tabla copiada desde Excel (si vienes de otra app)."));
    container.appendChild(c);
  }

  function renderInfo(container){
    UI.setPage("Ajustes", "Información", null);

    const c = card("Cuaderno de Mantenimiento", "Versión v6 (móvil)");
    c.appendChild(UI.el("div",{class:"tiny muted"}, "Datos guardados en localStorage (en este dispositivo)."));
    c.appendChild(UI.el("hr",{class:"sep"}));
    c.appendChild(UI.el("div",{class:"tiny"}, "Navegación inferior: Registros · Nuevo · Horas extra · Backup · Ajustes"));
    container.appendChild(c);
  }

  function render(){
    const host = document.getElementById("app");
    host.innerHTML="";
    const view = S.view;

    if(view==="registros") renderRegistros(host);
    else if(view==="form") renderForm(host);
    else if(view==="extra") renderExtra(host);
    else if(view==="backup") renderBackup(host);
    else if(view==="ajustes") renderInfo(host);
    else { S.view="registros"; renderRegistros(host); }
  }

  // -------- Navigation
  let nav=null;
  function initNav(){
    const i = MobileBottomNav.svgIcon;
    nav = MobileBottomNav.init([
      { id:"registros", label:"Registros", iconSvg: i("M4 6h16M4 12h16M4 18h16") },
      { id:"form", label:"Nuevo", iconSvg: i("M12 5v14M5 12h14") },
      { id:"extra", label:"Horas", iconSvg: i("M12 8v5l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0") },
      { id:"backup", label:"Backup", iconSvg: i("M12 3v12m0 0 4-4m-4 4-4-4M4 21h16") },
      { id:"ajustes", label:"Ajustes", iconSvg: i("M12 1l2 3 3 .5-2 3 .5 3-3-2-3 2 .5-3-2-3 3-.5z") },
    ]);
    nav.setActive("registros");
  }

  const App = {
    go(view){
      S.view = view;
      if(nav) nav.setActive(view==="ajustes" ? "ajustes" : view);
      render();
    },
    getState(){ return Object.assign({}, S); }
  };
  window.App = App;

  document.addEventListener("DOMContentLoaded", ()=>{
    initNav();
    render();
  });
})();
